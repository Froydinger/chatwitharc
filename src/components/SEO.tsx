import { Helmet } from "react-helmet-async";

const SITE_URL = "https://askarc.chat";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
}

export const SEO = ({
  title,
  description,
  path,
  image = "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/77302715-310d-4492-9c0a-75abfa08ba33",
  type = "website",
}: SEOProps) => {
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
};
