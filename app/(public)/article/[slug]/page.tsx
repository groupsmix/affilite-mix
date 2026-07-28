import type { Metadata } from "next";
import ContentPage, {
  generateMetadata as generateContentMetadata,
} from "../../[slug]/[nestedSlug]/page";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; token?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  return generateContentMetadata({
    params: Promise.resolve({ slug: "article", nestedSlug: slug }),
    searchParams,
  });
}

export default async function ArticleContentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  return (
    <ContentPage
      params={Promise.resolve({ slug: "article", nestedSlug: slug })}
      searchParams={searchParams}
    />
  );
}
