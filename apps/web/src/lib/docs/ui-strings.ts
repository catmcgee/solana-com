/**
 * The few interface strings the docs chrome shows, per docs locale: the TOC
 * heading, the page actions menu and the previous/next labels. They are the
 * wording the docs have shown in each language until now, kept in code (not
 * in the app's message catalogs) so this phase adds no translation work.
 * Previous/Next were English everywhere except Arabic (apps/docs
 * styles/theme.css, pagination), and still are.
 */
export interface DocsUiStrings {
  onThisPage: string;
  copyPage: string;
  copied: string;
  moreActions: string;
  copyPageDesc: string;
  viewMarkdown: string;
  viewMarkdownDesc: string;
  openChatGpt: string;
  openClaude: string;
  askAboutPage: string;
  previous: string;
  next: string;
}

type Base = Omit<DocsUiStrings, "copied" | "previous" | "next">;

const STRINGS: Record<string, Base> = {
  en: {
    onThisPage: "On this page",
    copyPage: "Copy page",
    moreActions: "More actions",
    copyPageDesc: "Copy page as Markdown for LLMs",
    viewMarkdown: "View as Markdown",
    viewMarkdownDesc: "View this page as plain text",
    openChatGpt: "Open in ChatGPT",
    openClaude: "Open in Claude",
    askAboutPage: "Ask questions about this page",
  },
  ar: {
    onThisPage: "في هذه الصفحة",
    copyPage: "نسخ الصفحة",
    moreActions: "المزيد من الإجراءات",
    copyPageDesc: "نسخ الصفحة بصيغة Markdown لـ LLMs",
    viewMarkdown: "عرض بصيغة Markdown",
    viewMarkdownDesc: "عرض هذه الصفحة كنص عادي",
    openChatGpt: "فتح في ChatGPT",
    openClaude: "فتح في Claude",
    askAboutPage: "اطرح أسئلة حول هذه الصفحة",
  },
  de: {
    onThisPage: "Auf dieser Seite",
    copyPage: "Seite kopieren",
    moreActions: "Weitere Aktionen",
    copyPageDesc: "Seite als Markdown für LLMs kopieren",
    viewMarkdown: "Als Markdown anzeigen",
    viewMarkdownDesc: "Diese Seite als Klartext anzeigen",
    openChatGpt: "In ChatGPT öffnen",
    openClaude: "In Claude öffnen",
    askAboutPage: "Fragen zu dieser Seite stellen",
  },
  es: {
    onThisPage: "En esta página",
    copyPage: "Copiar página",
    moreActions: "Más acciones",
    copyPageDesc: "Copiar página como Markdown para LLMs",
    viewMarkdown: "Ver como Markdown",
    viewMarkdownDesc: "Ver esta página como texto plano",
    openChatGpt: "Abrir en ChatGPT",
    openClaude: "Abrir en Claude",
    askAboutPage: "Hacer preguntas sobre esta página",
  },
  fi: {
    onThisPage: "Tällä sivulla",
    copyPage: "Kopioi sivu",
    moreActions: "Lisää toimintoja",
    copyPageDesc: "Kopioi sivu Markdownina LLM:ille",
    viewMarkdown: "Näytä Markdownina",
    viewMarkdownDesc: "Näytä tämä sivu pelkkänä tekstinä",
    openChatGpt: "Avaa ChatGPT:ssä",
    openClaude: "Avaa Claudessa",
    askAboutPage: "Esitä kysymyksiä tästä sivusta",
  },
  fr: {
    onThisPage: "Sur cette page",
    copyPage: "Copier la page",
    moreActions: "Plus d'actions",
    copyPageDesc: "Copier la page en Markdown pour les LLMs",
    viewMarkdown: "Voir en Markdown",
    viewMarkdownDesc: "Voir cette page en texte brut",
    openChatGpt: "Ouvrir dans ChatGPT",
    openClaude: "Ouvrir dans Claude",
    askAboutPage: "Poser des questions sur cette page",
  },
  id: {
    onThisPage: "Di halaman ini",
    copyPage: "Salin halaman",
    moreActions: "Tindakan lainnya",
    copyPageDesc: "Salin halaman sebagai Markdown untuk LLMs",
    viewMarkdown: "Lihat sebagai Markdown",
    viewMarkdownDesc: "Lihat halaman ini sebagai teks biasa",
    openChatGpt: "Buka di ChatGPT",
    openClaude: "Buka di Claude",
    askAboutPage: "Ajukan pertanyaan tentang halaman ini",
  },
  it: {
    onThisPage: "In questa pagina",
    copyPage: "Copia pagina",
    moreActions: "Più azioni",
    copyPageDesc: "Copia pagina come Markdown per LLMs",
    viewMarkdown: "Visualizza come Markdown",
    viewMarkdownDesc: "Visualizza questa pagina come testo semplice",
    openChatGpt: "Apri in ChatGPT",
    openClaude: "Apri in Claude",
    askAboutPage: "Fai domande su questa pagina",
  },
  ja: {
    onThisPage: "このページの内容",
    copyPage: "ページをコピー",
    moreActions: "その他のアクション",
    copyPageDesc: "LLMs用にMarkdownでページをコピー",
    viewMarkdown: "マークダウンで表示",
    viewMarkdownDesc: "このページをプレーンテキストで表示",
    openChatGpt: "ChatGPTで開く",
    openClaude: "Claudeで開く",
    askAboutPage: "このページについて質問する",
  },
  ko: {
    onThisPage: "이 페이지에서",
    copyPage: "페이지 복사",
    moreActions: "더 많은 작업",
    copyPageDesc: "LLMs용 Markdown으로 페이지 복사",
    viewMarkdown: "Markdown으로 보기",
    viewMarkdownDesc: "이 페이지를 일반 텍스트로 보기",
    openChatGpt: "ChatGPT에서 열기",
    openClaude: "Claude에서 열기",
    askAboutPage: "이 페이지에 대해 질문하기",
  },
  nl: {
    onThisPage: "Op deze pagina",
    copyPage: "Pagina kopiëren",
    moreActions: "Meer acties",
    copyPageDesc: "Pagina kopiëren als Markdown voor LLM's",
    viewMarkdown: "Bekijken als Markdown",
    viewMarkdownDesc: "Deze pagina bekijken als platte tekst",
    openChatGpt: "Openen in ChatGPT",
    openClaude: "Openen in Claude",
    askAboutPage: "Vragen stellen over deze pagina",
  },
  pl: {
    onThisPage: "Na tej stronie",
    copyPage: "Kopiuj stronę",
    moreActions: "Więcej działań",
    copyPageDesc: "Kopiuj stronę jako Markdown dla LLM",
    viewMarkdown: "Wyświetl jako Markdown",
    viewMarkdownDesc: "Wyświetl tę stronę jako zwykły tekst",
    openChatGpt: "Otwórz w ChatGPT",
    openClaude: "Otwórz w Claude",
    askAboutPage: "Zadaj pytania o tę stronę",
  },
  pt: {
    onThisPage: "Na página",
    copyPage: "Copiar página",
    moreActions: "Mais ações",
    copyPageDesc: "Copiar página como Markdown para LLMs",
    viewMarkdown: "Ver como Markdown",
    viewMarkdownDesc: "Ver esta página como texto simples",
    openChatGpt: "Abrir no ChatGPT",
    openClaude: "Abrir no Claude",
    askAboutPage: "Fazer perguntas sobre esta página",
  },
  ru: {
    onThisPage: "На этой странице",
    copyPage: "Копировать страницу",
    moreActions: "Дополнительные действия",
    copyPageDesc: "Копировать страницу в формате Markdown для LLMs",
    viewMarkdown: "Просмотр в формате Markdown",
    viewMarkdownDesc: "Просмотреть эту страницу как обычный текст",
    openChatGpt: "Открыть в ChatGPT",
    openClaude: "Открыть в Claude",
    askAboutPage: "Задать вопросы об этой странице",
  },
  tr: {
    onThisPage: "Bu sayfada",
    copyPage: "Sayfayı kopyala",
    moreActions: "Daha fazla eylem",
    copyPageDesc: "Sayfayı LLMs için Markdown olarak kopyala",
    viewMarkdown: "Markdown olarak görüntüle",
    viewMarkdownDesc: "Bu sayfayı düz metin olarak görüntüle",
    openChatGpt: "ChatGPT'de aç",
    openClaude: "Claude'da aç",
    askAboutPage: "Bu sayfa hakkında sorular sor",
  },
  uk: {
    onThisPage: "На цій сторінці",
    copyPage: "Скопіювати сторінку",
    moreActions: "Більше дій",
    copyPageDesc: "Скопіювати сторінку як Markdown для LLMs",
    viewMarkdown: "Переглянути як Markdown",
    viewMarkdownDesc: "Переглянути цю сторінку як звичайний текст",
    openChatGpt: "Відкрити в ChatGPT",
    openClaude: "Відкрити в Claude",
    askAboutPage: "Задати питання про цю сторінку",
  },
  vi: {
    onThisPage: "Trên trang này",
    copyPage: "Sao chép trang",
    moreActions: "Thêm hành động",
    copyPageDesc: "Sao chép trang dưới dạng Markdown cho LLMs",
    viewMarkdown: "Xem dưới dạng Markdown",
    viewMarkdownDesc: "Xem trang này dưới dạng văn bản thuần",
    openChatGpt: "Mở trong ChatGPT",
    openClaude: "Mở trong Claude",
    askAboutPage: "Đặt câu hỏi về trang này",
  },
  zh: {
    onThisPage: "在此页面",
    copyPage: "复制页面",
    moreActions: "更多操作",
    copyPageDesc: "将页面以 Markdown 格式复制给 LLMs",
    viewMarkdown: "以 Markdown 格式查看",
    viewMarkdownDesc: "以纯文本查看此页面",
    openChatGpt: "在 ChatGPT 中打开",
    openClaude: "在 Claude 中打开",
    askAboutPage: "询问有关此页面的问题",
  },
};

export function getDocsUiStrings(locale: string): DocsUiStrings {
  const base = STRINGS[locale] ?? STRINGS.en!;
  const ar = locale === "ar";
  return {
    ...base,
    copied: base.copyPage,
    previous: ar ? "السابق" : "Previous",
    next: ar ? "التالي" : "Next",
  };
}
