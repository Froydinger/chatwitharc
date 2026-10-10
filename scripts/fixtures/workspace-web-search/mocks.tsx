// Only service-connected artifact leaves are inert. The result card, modal,
// source badge, richMarkdown map, prose/tables, tabs and dialog are production.
export const LiquidMetalOverlay = () => null;
export const ImageModal = () => null;
export const SmoothImage = () => null;
export const FileAttachment = () => <span>Offline file attachment</span>;
export const MediaEmbed = () => <span>Offline media</span>;
export const MediaEmbeds = () => null;
export const getMediaType = () => 'none';
export const getYouTubeVideoId = () => null;
export const isImageUrl = () => false;
export const CodeBlock = ({ code }: { code: string }) => <pre>{code}</pre>;
export const SvgArtifact = () => <span>Offline SVG artifact</span>;
export const MermaidDiagram = () => <span>Offline diagram</span>;
export const InlineHumidityWheel = () => <span>Offline humidity visual</span>;
export const InlineProgressChart = () => <span>Offline chart</span>;
