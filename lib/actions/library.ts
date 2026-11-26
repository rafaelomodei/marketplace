import { z } from "zod";
import { costSettingsSchema, extraSchema, getCostSettings, setCostSettings } from "../costing";
import { openFolder } from "../export";
import {
  addProjectFiles,
  addVariation,
  colorSchema,
  allCategories,
  archiveProject,
  coverSchema,
  createProject,
  dismissInbox,
  getProject,
  importFromInbox,
  listInbox,
  listProjects,
  moveProjectFile,
  printFile,
  projectDir,
  projectPictures,
  recalculate,
  removeProjectFile,
  removeVariation,
  setFileUnits,
  setProjectCover,
  salePriceSchema,
  standardizeFileNames,
  updateProject,
  updateVariation,
} from "../library";
import { addModelViews, ensureStudioProduct, libraryFacts, studioSummary } from "../library-studio";
import { readMeta } from "../products";
import { findSlicer, getSlicerSettings, setSlicerSettings, slicerSettingsSchema } from "../slicer";
import { defineAction } from "./define";

const project = z.string().min(1).describe("Identificador do projeto da biblioteca (nome da pasta), ex.: vaso-colmeia");
const file = z.string().min(1).describe("Caminho do arquivo dentro do projeto, ex.: fatiados/vaso-colmeia.3mf (veja get_library_project)");
const folder = z.enum(["source", "print"]).describe("source = arquivos originais baixados; print = 3MF configurado no fatiador, pronto para imprimir");

export const listLibraryAction = defineAction({
  name: "list_library",
  title: "Listar biblioteca",
  description: "Lista os projetos da biblioteca de impressão 3D com categorias, capa, gramas, tempo, custo e preço sugerido do arquivo principal. Também traz as categorias existentes.",
  input: z.object({}),
  readOnly: true,
  run: () => ({ projects: listProjects(), categories: allCategories() }),
});

export const getLibraryProjectAction = defineAction({
  name: "get_library_project",
  title: "Ver projeto da biblioteca",
  description: "Dados de um projeto: arquivos originais e fatiados, mesas, impressora, filamentos, gramas, tempo, custo detalhado e preço sugerido de cada 3MF, e as variações (tamanhos/características) com custo, preço sugerido e preço por cor.",
  input: z.object({ project }),
  readOnly: true,
  run: ({ project }) => getProject(project),
});

export const createLibraryProjectAction = defineAction({
  name: "create_library_project",
  title: "Criar projeto",
  description: "Cria a pasta de um novo projeto na biblioteca. Depois adicione arquivos com import_downloads ou add_library_files.",
  input: z.object({
    name: z.string().trim().min(1).describe("Nome do projeto, ex.: Vaso colmeia"),
    categories: z.array(z.string().trim().min(1)).optional(),
    sourceUrl: z.string().trim().optional().describe("Link de onde o modelo foi baixado (MakerWorld, Printables…)"),
  }),
  run: ({ name, ...meta }) => ({ slug: createProject(name, meta) }),
});

export const updateLibraryProjectAction = defineAction({
  name: "update_library_project",
  title: "Editar projeto",
  description: "Muda nome, categorias, link de origem, anotações, capa, itens extras (argola, sacola, embalagem com custo unitário), minutos de mão de obra, tamanho (mm), quantidade de peças e preços de venda (por objeto montado, com kits: 1 un., 10 un.…) de um projeto.",
  input: z.object({
    project,
    name: z.string().trim().min(1).optional(),
    categories: z.array(z.string().trim().min(1)).optional(),
    sourceUrl: z.string().trim().optional(),
    notes: z.string().optional(),
    cover: coverSchema.nullable().optional().describe("Prefira set_library_cover"),
    extras: z.array(extraSchema).optional(),
    laborMinutes: z.number().nonnegative().nullable().optional(),
    size: z
      .object({ width: z.number().positive(), depth: z.number().positive(), height: z.number().positive() })
      .nullable()
      .optional()
      .describe("Tamanho do objeto pronto em mm (largura, comprimento, altura); null volta a usar o medido no arquivo"),
    salePrices: z
      .array(salePriceSchema)
      .optional()
      .describe("Preços de venda do objeto montado por quantidade, ex.: [{quantity:1, price:15}, {quantity:10, price:120}] (preço do lote inteiro). Substitui a lista toda; [] tira os preços"),
    pieces: z.number().int().positive().nullable().optional().describe("Quantas peças impressas formam UM objeto pronto (ex.: foto + moldura + laço = 3); define quantos objetos cada impressão rende"),
    colors: z
      .array(colorSchema)
      .optional()
      .describe("Cores oferecidas com filamento de preço diferente, ex.: [{name:'Dourado seda', perKg:180}] (perKg = preço do rolo de 1 kg; null = preço normal). Valem para todas as variações. Substitui a lista toda"),
  }),
  run: ({ project, ...patch }) => updateProject(project, patch),
});

export const listLibraryPicturesAction = defineAction({
  name: "list_library_pictures",
  title: "Ver imagens do projeto",
  description:
    "Imagens que podem ser a capa do projeto, a capa primeiro: mesas dos arquivos 3MF (source=file, com file e plate), fotos enviadas do produto (source=photo) e imagens aprovadas no estúdio de imagens (source=generated, com image). all=false traz só as leves (mesas com imagem do fatiador e fotos), como no card da biblioteca.",
  input: z.object({ project, all: z.boolean().default(true) }),
  readOnly: true,
  run: ({ project, all }) => projectPictures(project, { all }),
});

export const setLibraryCoverAction = defineAction({
  name: "set_library_cover",
  title: "Escolher capa",
  description:
    "Define a imagem de capa do projeto (aparece no card da biblioteca): uma mesa de um arquivo ({file, plate}), uma foto enviada ou imagem gerada no estúdio ({image}, caminho como em list_library_pictures). null volta ao padrão: a primeira mesa de um arquivo pronto para imprimir.",
  input: z.object({
    project,
    cover: coverSchema
      .nullable()
      .describe("{file:'fatiados/x.3mf', plate:2} ou {image:'real/foto.jpg' | 'approved/cena.png'}; null = padrão do 3MF"),
  }),
  run: ({ project, cover }) => ({ cover: setProjectCover(project, cover) }),
});

const variation = z.string().min(1).describe("Id da variação (veja variations em get_library_project), ex.: 15-cm");
const files = z.array(file).describe("Arquivos 3MF do projeto que imprimem esta variação. Cada arquivo é uma parte impressa separada (ex.: personagens + estábulo, corpo + base) e o custo soma todas. O mesmo arquivo pode estar em várias variações");

export const addLibraryVariationAction = defineAction({
  name: "add_library_variation",
  title: "Adicionar variação",
  description: "Cria uma variação do mesmo produto: outro tamanho (\"15 cm\"), outra característica (\"Base redonda\") ou os dois (\"15 cm base redonda\"). Basta título e o(s) arquivo(s) 3MF; tamanho e característica saem do título. O custo e o preço sugerido aparecem em get_library_project → variations.",
  input: z.object({
    project,
    title: z.string().trim().min(1).describe("Nome da variação como o cliente vê, ex.: 15 cm, Base redonda"),
    files: files.optional(),
    size: z.string().trim().optional().describe("Rótulo de tamanho para o anúncio (ex.: 15 cm); vazio = sem tamanho"),
    feature: z.string().trim().optional().describe("O que muda além do tamanho (ex.: Base redonda); vazio = nada"),
    salePrices: z.array(salePriceSchema).optional().describe("Preços de venda desta variação por quantidade (como em update_library_project)"),
  }),
  run: ({ project, ...input }) => addVariation(project, input),
});

export const updateLibraryVariationAction = defineAction({
  name: "update_library_variation",
  title: "Editar variação",
  description: "Muda título, arquivos, tamanho, característica ou preços de venda de uma variação.",
  input: z.object({
    project,
    variation,
    title: z.string().trim().min(1).optional(),
    files: files.optional(),
    size: z.string().trim().optional(),
    feature: z.string().trim().optional(),
    salePrices: z.array(salePriceSchema).optional().describe("Substitui a lista toda; [] tira os preços"),
  }),
  run: ({ project, variation, ...patch }) => updateVariation(project, variation, patch),
});

export const removeLibraryVariationAction = defineAction({
  name: "remove_library_variation",
  title: "Tirar variação",
  description: "Tira uma variação do produto. Os arquivos continuam no projeto.",
  input: z.object({ project, variation }),
  run: ({ project, variation }) => removeVariation(project, variation),
});

export const archiveLibraryProjectAction = defineAction({
  name: "archive_library_project",
  title: "Arquivar projeto",
  description: "Tira o projeto da biblioteca movendo a pasta para a lixeira da biblioteca (.lixeira). Nada é apagado.",
  input: z.object({ project }),
  run: ({ project }) => archiveProject(project),
});

export const addLibraryFilesAction = defineAction({
  name: "add_library_files",
  title: "Enviar arquivos 3D",
  description: "Adiciona arquivos STL ou 3MF a um projeto (conteúdo em base64). 3MF salvo com configurações de impressora vai para 'fatiados'; o resto para 'origem'.",
  input: z.object({
    project,
    folder: folder.optional(),
    variation: z.string().min(1).optional().describe("Id da variação de que estes 3MF são partes (ex.: principal). Sem ela, o primeiro vai para um produto ainda sem arquivo e o resto fica solto para ser colocado."),
    files: z.array(z.object({ name: z.string().min(1), data: z.union([z.string().describe("Conteúdo em base64"), z.instanceof(Uint8Array)]) })).min(1),
  }),
  run: ({ project, folder, variation, files }) => ({
    saved: addProjectFiles(project, files.map((f) => ({ name: f.name, data: typeof f.data === "string" ? Buffer.from(f.data, "base64") : f.data })), folder, variation),
  }),
});

export const moveLibraryFileAction = defineAction({
  name: "move_library_file",
  title: "Mover arquivo",
  description: "Move um arquivo do projeto entre 'origem' (source) e 'fatiados' (print).",
  input: z.object({ project, file, folder }),
  run: ({ project, file, folder }) => ({ file: moveProjectFile(project, file, folder) }),
});

export const removeLibraryFileAction = defineAction({
  name: "remove_library_file",
  title: "Tirar arquivo",
  description: "Move um arquivo do projeto para a lixeira do projeto (.lixeira). Nada é apagado.",
  input: z.object({ project, file }),
  run: ({ project, file }) => removeProjectFile(project, file),
});

export const setLibraryFileUnitsAction = defineAction({
  name: "set_library_file_units",
  title: "Objetos por impressão",
  description: "Define quantos objetos prontos uma impressão do arquivo rende (ex.: mesa com 27 peças, 3 por objeto = 9). O custo da impressão é dividido por esse número. null volta ao cálculo automático (peças do arquivo ÷ peças por objeto).",
  input: z.object({ project, file, units: z.number().int().positive().nullable() }),
  run: ({ project, file, units }) => setFileUnits(project, file, units),
});

export const printLibraryFileAction = defineAction({
  name: "print_library_file",
  title: "Abrir no fatiador",
  description: "Abre o arquivo no fatiador desta máquina (Creality Print), já com as configurações salvas, para mandar imprimir.",
  input: z.object({ project, file }),
  run: ({ project, file }) => printFile(project, file),
});

export const recalculateLibraryFileAction = defineAction({
  name: "recalculate_library_file",
  title: "Recalcular arquivo",
  description: "Fatia de novo o 3MF em segundo plano para atualizar gramas, tempo e custo. Normalmente é automático ao salvar o arquivo.",
  input: z.object({ project, file }),
  run: ({ project, file }) => recalculate(project, file),
});

export const openLibraryFolderAction = defineAction({
  name: "open_library_folder",
  title: "Abrir pasta do projeto",
  description: "Abre a pasta do projeto no explorador de arquivos.",
  input: z.object({ project }),
  run: ({ project }) => openFolder(projectDir(project), project),
});

export const listDownloadsAction = defineAction({
  name: "list_downloads",
  title: "Arquivos baixados",
  description: "Lista os STL/3MF da pasta Downloads que ainda não foram trazidos para a biblioteca.",
  input: z.object({}),
  readOnly: true,
  run: () => listInbox(),
});

export const importDownloadsAction = defineAction({
  name: "import_downloads",
  title: "Trazer arquivos baixados",
  description: "Copia arquivos da pasta Downloads para um projeto existente (project) ou para um projeto novo (name; sem nome usa o do primeiro arquivo).",
  input: z.object({
    files: z.array(z.string().min(1)).min(1).describe("Nomes dos arquivos em Downloads (veja list_downloads)"),
    project: project.optional(),
    name: z.string().trim().optional(),
  }),
  run: ({ files, project, name }) => importFromInbox(files, { slug: project, name }),
});

export const dismissDownloadsAction = defineAction({
  name: "dismiss_downloads",
  title: "Ignorar arquivos baixados",
  description: "Esconde arquivos da lista de baixados sem importar (o arquivo continua em Downloads).",
  input: z.object({ files: z.array(z.string().min(1)).min(1) }),
  run: ({ files }) => dismissInbox(files),
});

export const getLibrarySettingsAction = defineAction({
  name: "get_library_settings",
  title: "Ver configurações de custo",
  description: "Fórmula de custo (energia, mão de obra, margem, impressoras) e o fatiador usado.",
  input: z.object({}),
  readOnly: true,
  run: () => ({ cost: getCostSettings(), slicer: { ...getSlicerSettings(), found: findSlicer() } }),
});

export const updateLibrarySettingsAction = defineAction({
  name: "update_library_settings",
  title: "Salvar configurações de custo",
  description: "Atualiza a fórmula de custo (cost) e/ou o caminho do fatiador (slicer.path). Os custos de todos os arquivos são recalculados na hora.",
  input: z.object({ cost: costSettingsSchema.partial().optional(), slicer: slicerSettingsSchema.partial().optional() }),
  run: ({ cost, slicer }) => ({
    cost: cost ? setCostSettings({ ...getCostSettings(), ...cost }) : getCostSettings(),
    slicer: { ...(slicer ? setSlicerSettings({ ...getSlicerSettings(), ...slicer }) : getSlicerSettings()), found: findSlicer() },
  }),
});

export const standardizeLibraryFileNamesAction = defineAction({
  name: "standardize_library_file_names",
  title: "Padronizar nomes dos arquivos",
  description: "Renomeia os arquivos do projeto para o padrão da biblioteca: nome do projeto em camelCase e, nos 3MF configurados, \"_\" + impressora (ex.: vasoColmeia_K1Max.3mf). Mantém capa, rendimento e cálculos.",
  input: z.object({ project }),
  run: ({ project }) => ({ renamed: standardizeFileNames(project) }),
});

export const getLibraryStudioAction = defineAction({
  name: "get_library_studio",
  title: "Ver produto ligado no estúdio",
  description: "Produto do estúdio de imagens ligado a este projeto da biblioteca (se houver) e suas fotos do produto.",
  input: z.object({ project }),
  readOnly: true,
  run: ({ project }) => studioSummary(project),
});

export const openInImageStudioAction = defineAction({
  name: "open_in_image_studio",
  title: "Levar para o estúdio de imagens",
  description: "Garante o produto do estúdio de imagens deste projeto (cria com o mesmo nome na primeira vez, já com tamanho e preço na ficha) e devolve o slug do produto. Use add_images com esse slug para enviar fotos.",
  input: z.object({ project }),
  run: ({ project }) => ({ product: ensureStudioProduct(project) }),
});

export const addModelViewsAction = defineAction({
  name: "add_model_views_to_studio",
  title: "Usar o modelo 3D como foto",
  description: "Gera 4 vistas do modelo 3D (frente, lado, costas, cima) e coloca nas fotos do produto do estúdio de imagens. Só funciona quando o arquivo tem uma única peça (objeto montado).",
  input: z.object({ project }),
  run: ({ project }) => addModelViews(project),
});

export const getProductLibraryAction = defineAction({
  name: "get_product_library",
  title: "Dados da biblioteca do produto",
  description: "Para um produto do estúdio de imagens: o projeto da biblioteca de onde veio, com tamanho em mm, peças por objeto, preços de venda (com kits), filamento por objeto, custo e preço sugerido. null se o produto não veio da biblioteca.",
  input: z.object({ slug: z.string().min(1).describe("Slug do produto do estúdio") }),
  readOnly: true,
  run: ({ slug }) => {
    const project = readMeta(slug).libraryProject;
    if (!project) return null;
    try { return libraryFacts(project); } catch { return null; }
  },
});
