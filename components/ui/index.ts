/**
 * Ateliê design system — atomic design. Check here before creating a component.
 * atoms → molecules → organisms → templates. Tokens live in app/globals.css; catalogue at /design-system.
 */
export { Badge, type BadgeTone } from "./atoms/Badge";
export { Button, ButtonLink, buttonClass, type ButtonStyle } from "./atoms/Button";
export { Card } from "./atoms/Card";
export { Elapsed } from "./atoms/Elapsed";
export { Icon, IconTile, type TileTone } from "./atoms/Icon";
export { Input, Textarea } from "./atoms/Input";
export { Logo } from "./atoms/Logo";
export { Progress } from "./atoms/Progress";
export { Slider } from "./atoms/Slider";
export { Spinner } from "./atoms/Spinner";
export { Swatch } from "./atoms/Swatch";
export { Code, Heading, Lead, Muted } from "./atoms/Text";

export { Alert } from "./molecules/Alert";
export { ChoiceGroup, type Choice } from "./molecules/ChoiceGroup";
export { Disclosure } from "./molecules/Disclosure";
export { Dropzone } from "./molecules/Dropzone";
export { EmptyState } from "./molecules/EmptyState";
export { FeatureGrid, type Feature } from "./molecules/FeatureGrid";
export { Field } from "./molecules/Field";
export { FormSection } from "./molecules/FormSection";
export { ImageTile } from "./molecules/ImageTile";
export { OptionCard } from "./molecules/OptionCard";
export { RangeField } from "./molecules/RangeField";
export { Stepper, type Step } from "./molecules/Stepper";

export { ErrorBanner } from "./organisms/ErrorBanner";
export { Lightbox } from "./organisms/Lightbox";
export { PaintedBackdrop } from "./organisms/PaintedBackdrop";
export { SiteHeader, type HeaderTab } from "./organisms/SiteHeader";

export { Container } from "./templates/Container";
export { SectionHeader } from "./templates/SectionHeader";
