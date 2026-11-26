import ProjectView from "./ProjectView";

export default async function LibraryProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProjectView slug={slug} />;
}
