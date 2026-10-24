export { GET } from "@/app/news/google-news.xml/route";

// Route segment config must be a literal in this file (Next.js 16 rejects a
// re-exported `revalidate`); keep it equal to google-news.xml's.
export const revalidate = 300;
