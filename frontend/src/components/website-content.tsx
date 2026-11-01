import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, History, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api, tokenStore } from "../lib/api";
import { SITE_ICONS } from "./site-icons";

type Faq = { q: string; a: string };
type Fact = { label: string; value: string };
type ProductText = {
  title?: string;
  tagline: string;
  about: string;
  features: string[];
  eligibility: string[];
  documents: string[];
  facts: Fact[];
};
type CaseStudy = {
  slug: string;
  group: string;
  category: string;
  headline: string;
  amountLabel: string;
  productSlug: string;
  productLabel: string;
  clientProfile: string;
  challenge: string;
  structuring: string;
  outcome: string;
  visible: boolean;
};
type ServiceText = {
  division?: string;
  title: string;
  summary: string;
  whoNeedsIt: string;
  process: string[];
  documents: string[];
};
type SiteInfo = {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  reportPrice: number;
  upiId: string;
  upiName: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  x?: string;
  googleAnalyticsId?: string;
  metaPixelId?: string;
};
type Content = {
  faqs?: Record<string, Faq[]>;
  products?: Record<string, ProductText>;
  caseStudies?: CaseStudy[];
  services?: Record<string, ServiceText>;
  siteInfo?: SiteInfo;
  pageText?: PageTextMap;
  images?: ImageMap;
  bankRates?: BankRates;
  seo?: SeoMap;
  seoPages?: SeoPage[];
  testimonials?: Testimonial[];
  trustNumbers?: Figures;
  customPages?: CustomPage[];
  lists?: Lists;
  listSpecs?: ListSpec[];
  iconNames?: string[];
  homeText?: Record<string, string>;
  homeTextSpec?: HomeTextSection[];
  aboutText?: Record<string, string>;
  aboutTextSpec?: HomeTextSection[];
  contactText?: Record<string, string>;
  contactTextSpec?: HomeTextSection[];
  servicesText?: Record<string, string>;
  servicesTextSpec?: HomeTextSection[];
  cibilText?: Record<string, string>;
  cibilTextSpec?: HomeTextSection[];
  whyusText?: Record<string, string>;
  whyusTextSpec?: HomeTextSection[];
  calegalText?: Record<string, string>;
  calegalTextSpec?: HomeTextSection[];
  partnerText?: Record<string, string>;
  partnerTextSpec?: HomeTextSection[];
  trackText?: Record<string, string>;
  trackTextSpec?: HomeTextSection[];
  builderText?: Record<string, string>;
  builderTextSpec?: HomeTextSection[];
  freelancerText?: Record<string, string>;
  freelancerTextSpec?: HomeTextSection[];
  estimatorText?: Record<string, string>;
  estimatorTextSpec?: HomeTextSection[];
  insightsText?: Record<string, string>;
  insightsTextSpec?: HomeTextSection[];
  casesText?: Record<string, string>;
  casesTextSpec?: HomeTextSection[];
  ratesText?: Record<string, string>;
  ratesTextSpec?: HomeTextSection[];
  toolsText?: Record<string, string>;
  toolsTextSpec?: HomeTextSection[];
  advisorText?: Record<string, string>;
  advisorTextSpec?: HomeTextSection[];
  advisoryText?: Record<string, string>;
  advisoryTextSpec?: HomeTextSection[];
  cityText?: Record<string, string>;
  cityTextSpec?: HomeTextSection[];
  loanPageText?: Record<string, string>;
  loanPageTextSpec?: HomeTextSection[];
  casePageText?: Record<string, string>;
  casePageTextSpec?: HomeTextSection[];
  servicePageText?: Record<string, string>;
  servicePageTextSpec?: HomeTextSection[];
  siteText?: Record<string, string>;
  siteTextSpec?: HomeTextSection[];
  "pageText:hi"?: PageTextMap;
  "pageText:mr"?: PageTextMap;
};
type HomeTextField = { id: string; label: string; text: string; long?: boolean };
type HomeTextSection = { id: string; label: string; hint: string; fields: HomeTextField[] };
type PageTextMap = Record<string, Record<string, string>>;
type ImageMap = Record<string, string>;
type RateRow = {
  product: string;
  bank: string;
  rateFrom: string;
  rateTo?: string;
  fee?: string;
  note?: string;
};
type BankRates = { asOf: string; disclaimer: string; defaultEmiRate: number; rows: RateRow[] };
type SeoEntry = { title?: string; description?: string };
type SeoMap = Record<string, SeoEntry>;
type SeoPage = { path: string; label: string; title: string; description: string };
type Testimonial = {
  name: string;
  city: string;
  product: string;
  rating: number;
  quote: string;
  visible: boolean;
};
type Figures = Record<string, string>;
type CustomPage = {
  slug: string;
  title: string;
  kind: "post" | "page";
  summary?: string;
  body: string;
  date?: string;
  image?: string;
  published?: boolean;
  showInFooter?: boolean;
};
type ListField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "icon" | "image" | "readonly" | "yesno";
};
type ListSpec = {
  key: string;
  page: string;
  label: string;
  hint: string;
  fields: ListField[];
  fixed?: boolean;
};
type ListItem = Record<string, string>;
type Lists = Record<string, ListItem[]>;
type Section = "homeText" | "aboutText" | "contactText" | "servicesText" | "cibilText" | "whyusText" | "calegalText" | "partnerText" | "trackText" | "builderText" | "freelancerText" | "estimatorText" | "insightsText" | "casesText" | "ratesText" | "toolsText" | "advisorText" | "advisoryText" | "cityText" | "loanPageText" | "casePageText" | "servicePageText" | "siteText" | "lists" | "pageText:hi" | "pageText:mr" | "customPages" | "testimonials" | "trustNumbers" | "seo" | "bankRates" | "images" | "pageText" | "siteInfo" | "faqs" | "products" | "services" | "caseStudies";
type Saved = { key: string; value: unknown; updatedAt: string; updatedByName: string | null };

const TEXT_SECTIONS = [
  "homeText",
  "aboutText",
  "contactText",
  "servicesText",
  "cibilText",
  "whyusText",
  "calegalText",
  "partnerText",
  "trackText",
  "builderText",
  "freelancerText",
  "estimatorText",
  "insightsText",
  "casesText",
  "ratesText",
  "toolsText",
  "advisorText",
  "advisoryText",
  "cityText",
  "loanPageText",
  "casePageText",
  "servicePageText",
  "siteText",
] as const;

const SECTIONS: { id: Section; label: string; help: string }[] = [
  {
    id: "loanPageText",
    label: "Headings & buttons",
    help: "The wording that is the same on every loan page: the buttons, the section headings, the calculators heading, the process headings and the closing banner. {loan} becomes the loan's name, {code} its short code and {group} its category. Each loan's own description, features and figures are under Loan product pages.",
  },
  {
    id: "casePageText",
    label: "Headings & buttons",
    help: "The wording that is the same on every case study page: the labels, the three stages, the card beside the story and the link on similar cases. {title} becomes the loan's name. Each case's own story is under Case studies.",
  },
  {
    id: "servicePageText",
    label: "Headings & buttons",
    help: "The wording that is the same on every CA and legal service page: the small lines above each block and the words under the enquiry form. {title}, {category} and {phone} are filled in. Each service's own text is under CA & legal services.",
  },
  {
    id: "siteText",
    label: "Headings & buttons",
    help: "The words in the header and footer on every page: the footer text under the logo, its headings, the callback button, the copyright line and the Contact Us button. {year} becomes the current year. The menu and footer links are under Blocks; the address, phone and email are under Phone, email & address.",
  },
  {
    id: "builderText",
    label: "Headings & paragraphs",
    help: "The wording on the Builder Partner page that is not in a repeated block: the opening panel, the form's heading and thank-you message, every section heading and the closing banner. {name} becomes the assistant's name.",
  },
  {
    id: "freelancerText",
    label: "Headings & paragraphs",
    help: "The wording on the Freelancer Partner page that is not in a repeated block: the opening panel, the form's heading and thank-you message, every section heading and the closing banner. {name} becomes the assistant's name.",
  },
  {
    id: "estimatorText",
    label: "Headings & paragraphs",
    help: "The wording around the Credit Score Estimator: the opening panel, the two boxes under it and the note at the foot. The estimator's own questions are not editable, because the score depends on them.",
  },
  {
    id: "insightsText",
    label: "Headings & paragraphs",
    help: "The heading on the Insights page and the link on each article. The articles themselves are written under New pages & articles.",
  },
  {
    id: "casesText",
    label: "Headings & paragraphs",
    help: "The wording on the Case Studies page around the cases: the opening panel, the filter and link text and the closing banner. The cases themselves are under Case studies.",
  },
  {
    id: "ratesText",
    label: "Headings & paragraphs",
    help: "The wording on the Interest Rates page around the table: the opening panel, the note and buttons under the table and the heading above the calculators. The rate rows are under Interest rates.",
  },
  {
    id: "toolsText",
    label: "Headings & paragraphs",
    help: "The wording on the Calculators page: the opening panel, the side menu heading, the note under a calculator and the three info cards. The calculator names are under Blocks.",
  },
  {
    id: "advisorText",
    label: "Headings & paragraphs",
    help: "The heading above the Loan Expert's short questions. The questions themselves are not editable, because the answers depend on them.",
  },
  {
    id: "advisoryText",
    label: "Headings & paragraphs",
    help: "The wording on the CIBIL Advisory page that is not in a card list or a picture: the opening panel, each block's heading and text, the five steps' heading and the important note.",
  },
  {
    id: "cityText",
    label: "Headings & paragraphs",
    help: "The wording shared by the Mumbai, Thane, Navi Mumbai and Pune pages. {city} becomes the name of the city on each page. Each city's own intro and service note are under Blocks, and its questions are under FAQs.",
  },
  {
    id: "calegalText",
    label: "Headings & paragraphs",
    help: "The wording on the CA & Legal page that is not in a repeated block: the opening statement, the heading of each practice and the enquiry block. The services themselves are under CA & legal services.",
  },
  {
    id: "partnerText",
    label: "Headings & paragraphs",
    help: "The wording on the Partner page that is not in a repeated block: the opening panel, every section heading, the commission note and the closing banner. {name} becomes the assistant's name. The commission rows come from the commission rate cards.",
  },
  {
    id: "trackText",
    label: "Headings & panels",
    help: "The wording on the Track Application page: the heading, the two choices and the text in the Client and Partner panels. The sign-in boxes themselves are not editable, because the flow depends on them.",
  },
  {
    id: "whyusText",
    label: "Headings & paragraphs",
    help: "The wording on the Why Us page that is not in a repeated block: the opening statement, section headings, the mission and vision and the closing banner. The common concerns are the same list as on the Home page.",
  },
  {
    id: "cibilText",
    label: "Headings & notes",
    help: "The wording on the CIBIL page around the report request: the opening panel, the side notes and the heading above the calculators. {price} becomes the report price. The request form's own questions are not editable, because the flow depends on them. The price and the UPI ID are under Contact & CIBIL.",
  },
  {
    id: "servicesText",
    label: "Headings & buttons",
    help: "The wording on the Services page that is not in a repeated block: the opening heading and paragraph, the goal heading, the link on each loan card and the closing banner. {count} becomes the number of loan products. The table of lender kinds is edited on the Home page tab.",
  },
  {
    id: "contactText",
    label: "Headings & paragraphs",
    help: "The wording on the Contact page that is not in a repeated block: the opening panel, the quote, the office text and buttons, and the heading above the questions. Phone, email, address and hours are under Phone, email & address.",
  },
  {
    id: "aboutText",
    label: "Headings & paragraphs",
    help: "The wording on the About page that is not in a repeated block: the opening statement, our story, the mission and vision, section headings and buttons.",
  },
  {
    id: "homeText",
    label: "Headings & buttons",
    help: "The wording on the Home page that is not in a repeated block: the opening statement, section headings, buttons and the closing banner.",
  },
  {
    id: "customPages",
    label: "New pages & articles",
    help: "Write a new article for the Insights page, or a stand-alone page (for example a new loan type or scheme). It appears at /p/<address>.",
  },
  {
    id: "testimonials",
    label: "Client stories",
    help: "The client quotes scrolling on the home page. Add, edit or hide them.",
  },
  {
    id: "trustNumbers",
    label: "Trust figures",
    help: "Headline figures used across the site. Changing one updates it everywhere it appears (home, About, footer and more).",
  },
  {
    id: "seo",
    label: "Search listings",
    help: "How each page appears in Google: the blue title and the grey description. Leave a page empty to keep its built-in wording.",
  },
  {
    id: "bankRates",
    label: "Interest rates",
    help: "The table on the website's Interest Rates page, and the starting rate in the EMI calculator. Add a row per bank and loan type.",
  },
  {
    id: "pageText:hi",
    label: "Hindi",
    help: "Hindi wording. On the website, sign in here as an admin, switch the language to हिं, press Edit text and click any wording to write it in Hindi. Visitors who choose Hindi then see it.",
  },
  {
    id: "pageText:mr",
    label: "Marathi",
    help: "Marathi wording. On the website, switch the language to मरा, press Edit text and click any wording to write it in Marathi.",
  },
  {
    id: "images",
    label: "Pictures",
    help: "Pictures replaced straight on the website (Edit text mode, then click a picture). Undo one to bring back the original.",
  },
  {
    id: "pageText",
    label: "Page wording",
    help: "Wording changed straight on the website (sign in here, open any page, press Edit text). Review or undo those changes here.",
  },
  {
    id: "lists",
    label: "Page sections",
    help: "The repeated blocks on the Home, About, Why Us, Partner and Services pages: hero points, steps, benefits, reasons, figures and more. Reword, add, remove or reorder items.",
  },
  {
    id: "siteInfo",
    label: "Contact & CIBIL",
    help: "Phone, WhatsApp, email, address and hours shown across the site, plus the credit report price and the UPI ID the payment QR uses.",
  },
  { id: "faqs", label: "FAQs", help: "Questions and answers on the Contact, Partner and city pages." },
  {
    id: "products",
    label: "Loan product pages",
    help: "The description, features, eligibility and documents on each loan page.",
  },
  {
    id: "services",
    label: "CA & legal services",
    help: "The summary, who needs it, process steps and documents on each CA and legal service page.",
  },
  {
    id: "caseStudies",
    label: "Case studies",
    help: "The success stories on the Case studies page. Hide one to take it off the site.",
  },
];

const FAQ_PAGES: Record<string, string> = {
  contact: "Contact page",
  partner: "Partner page",
  mumbai: "Mumbai page",
  thane: "Thane page",
  "navi-mumbai": "Navi Mumbai page",
  pune: "Pune page",
};

const GROUPS = ["Home & Property", "Business & Cash Flow", "Personal Goals"];

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Admin-only editor for the text on the public website. Until staff save a section, the website
 * shows the copy built into it; saving here replaces it, and "Reset" brings the built-in copy back.
 */
/** The sections that belong to one page's tab, with the names that make sense there. */
const PAGE_SCOPES = {
  home: {
    first: "homeText" as Section,
    listPage: "Home",
    seoPath: "/",
    sections: {
      homeText: "Headings & buttons",
      lists: "Blocks (hero points, steps, banks…)",
      testimonials: "Client stories",
      trustNumbers: "Trust figures",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  about: {
    first: "aboutText" as Section,
    listPage: "About",
    seoPath: "/about",
    sections: {
      aboutText: "Headings & paragraphs",
      lists: "Blocks (figures, reasons, steps)",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  calegal: {
    first: "calegalText" as Section,
    listPage: "CA & Legal",
    seoPath: "/ca-legal-services",
    sections: {
      calegalText: "Headings & paragraphs",
      lists: "Blocks (steps)",
      services: "CA & legal services",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  partner: {
    first: "partnerText" as Section,
    listPage: "Partner",
    seoPath: "/partner",
    sections: {
      partnerText: "Headings & paragraphs",
      lists: "Blocks (figures, cards, steps)",
      faqs: "FAQs",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  track: {
    first: "trackText" as Section,
    listPage: "Track",
    seoPath: "/track-application",
    sections: {
      trackText: "Headings & panels",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  builder: {
    first: "builderText" as Section,
    listPage: "None",
    seoPath: "/partner/builder",
    seoPaths: ["/partner/builder"],
    sections: {
      builderText: "Headings & paragraphs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  freelancer: {
    first: "freelancerText" as Section,
    listPage: "None",
    seoPath: "/partner/freelancer",
    seoPaths: ["/partner/freelancer"],
    sections: {
      freelancerText: "Headings & paragraphs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  estimator: {
    first: "estimatorText" as Section,
    listPage: "None",
    seoPath: "/credit-score-estimator",
    seoPaths: ["/credit-score-estimator"],
    sections: {
      estimatorText: "Headings & paragraphs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  insights: {
    first: "insightsText" as Section,
    listPage: "None",
    seoPath: "/insights",
    seoPaths: ["/insights"],
    sections: {
      insightsText: "Headings & paragraphs",
      customPages: "New pages & articles",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  cases: {
    first: "casesText" as Section,
    listPage: "None",
    seoPath: "/case-studies",
    seoPaths: ["/case-studies"],
    sections: {
      casesText: "Headings & paragraphs",
      caseStudies: "Case studies",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  rates: {
    first: "ratesText" as Section,
    listPage: "None",
    seoPath: "/rates",
    seoPaths: ["/rates"],
    sections: {
      ratesText: "Headings & paragraphs",
      bankRates: "Interest rates",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  tools: {
    first: "toolsText" as Section,
    listPage: "Tools",
    seoPath: "/tools",
    seoPaths: ["/tools"],
    sections: {
      toolsText: "Headings & paragraphs",
      lists: "Blocks (calculator names)",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  advisor: {
    first: "advisorText" as Section,
    listPage: "None",
    seoPath: "/ai-loan-advisor",
    seoPaths: ["/ai-loan-advisor"],
    sections: {
      advisorText: "Headings & paragraphs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  advisory: {
    first: "advisoryText" as Section,
    listPage: "None",
    seoPath: "/cibil-advisory",
    seoPaths: ["/cibil-advisory"],
    sections: {
      advisoryText: "Headings & paragraphs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  city: {
    first: "cityText" as Section,
    listPage: "City pages",
    seoPath: "/mumbai",
    seoPaths: ["/mumbai", "/thane", "/navi-mumbai", "/pune"],
    sections: {
      cityText: "Headings & paragraphs",
      lists: "Blocks (each city's intro)",
      faqs: "FAQs",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  loanpages: {
    first: "loanPageText" as Section,
    listPage: "None",
    seoPath: "/services/",
    seoPaths: [],
    seoPrefix: "/services/",
    sections: {
      loanPageText: "Headings & buttons",
      products: "Loan product pages",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  casepages: {
    first: "casePageText" as Section,
    listPage: "None",
    seoPath: "/case-studies/",
    seoPaths: [],
    seoPrefix: "/case-studies/",
    sections: {
      casePageText: "Headings & buttons",
      caseStudies: "Case studies",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  servicepages: {
    first: "servicePageText" as Section,
    listPage: "None",
    seoPath: "/ca-legal-services/",
    seoPaths: [],
    seoPrefix: "/ca-legal-services/",
    sections: {
      servicePageText: "Headings & buttons",
      services: "CA & legal services",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  site: {
    first: "siteText" as Section,
    listPage: "Menu & footer",
    seoPath: "/none",
    seoPaths: [],
    seoPrefix: "",
    sections: {
      siteText: "Headings & buttons",
      lists: "Blocks (menu & footer links)",
      siteInfo: "Phone, email & address",
    } as Partial<Record<Section, string>>,
  },
  whyus: {
    first: "whyusText" as Section,
    listPage: "Why Us",
    seoPath: "/why-us",
    sections: {
      whyusText: "Headings & paragraphs",
      lists: "Blocks (strengths, ticks)",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  cibil: {
    first: "cibilText" as Section,
    listPage: "CIBIL",
    seoPath: "/cibil",
    sections: {
      cibilText: "Headings & notes",
      lists: "Blocks (steps, bureaus, choices)",
      siteInfo: "Report price & UPI",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  services: {
    first: "servicesText" as Section,
    listPage: "Services",
    seoPath: "/services",
    sections: {
      servicesText: "Headings & buttons",
      lists: "Blocks (categories, figures)",
      products: "Loan product pages",
      images: "Pictures",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
  contact: {
    first: "contactText" as Section,
    listPage: "Contact",
    seoPath: "/contact",
    sections: {
      contactText: "Headings & paragraphs",
      lists: "Blocks (tick points)",
      faqs: "FAQs",
      siteInfo: "Phone, email & address",
      seo: "Google listing",
    } as Partial<Record<Section, string>>,
  },
};

/** The headings-and-paragraphs spec the website shared for a page's wording section. */
function textSpecFor(section: Section, content: Content | undefined): HomeTextSection[] {
  const by: Partial<Record<Section, HomeTextSection[] | undefined>> = {
    homeText: content?.homeTextSpec,
    aboutText: content?.aboutTextSpec,
    contactText: content?.contactTextSpec,
    servicesText: content?.servicesTextSpec,
    cibilText: content?.cibilTextSpec,
    whyusText: content?.whyusTextSpec,
    calegalText: content?.calegalTextSpec,
    partnerText: content?.partnerTextSpec,
    trackText: content?.trackTextSpec,
    builderText: content?.builderTextSpec,
    freelancerText: content?.freelancerTextSpec,
    estimatorText: content?.estimatorTextSpec,
    insightsText: content?.insightsTextSpec,
    casesText: content?.casesTextSpec,
    ratesText: content?.ratesTextSpec,
    toolsText: content?.toolsTextSpec,
    advisorText: content?.advisorTextSpec,
    advisoryText: content?.advisoryTextSpec,
    cityText: content?.cityTextSpec,
    loanPageText: content?.loanPageTextSpec,
    casePageText: content?.casePageTextSpec,
    servicePageText: content?.servicePageTextSpec,
    siteText: content?.siteTextSpec,
  };
  return by[section] ?? [];
}

export function WebsiteContent({ scope }: { scope?: "home" | "about" | "contact" | "services" | "cibil" | "whyus" | "calegal" | "partner" | "track" | "builder" | "freelancer" | "estimator" | "insights" | "cases" | "rates" | "tools" | "advisor" | "advisory" | "city" | "loanpages" | "casepages" | "servicepages" | "site" } = {}) {
  const queryClient = useQueryClient();
  const page = scope ? PAGE_SCOPES[scope] : undefined;
  const [section, setSection] = useState<Section>(page ? page.first : "pageText");

  const saved = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api<Saved[]>("/settings/site-content"),
  });
  const defaults = useQuery({
    queryKey: ["site-content-defaults"],
    queryFn: () => api<Content>("/settings/site-content/defaults"),
  });

  const savedByKey = useMemo(() => {
    const m = new Map<string, Saved>();
    for (const s of saved.data ?? []) m.set(s.key, s);
    return m;
  }, [saved.data]);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: Section; value: unknown }) =>
      api(`/settings/site-content/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["site-content"] }),
  });
  const reset = useMutation({
    mutationFn: (key: Section) => api(`/settings/site-content/${key}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["site-content"] }),
  });

  if (saved.isPending || defaults.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  const error = [saved, defaults, save, reset].find((q) => q.isError)?.error;
  const current = SECTIONS.find((s) => s.id === section)!;
  const row = savedByKey.get(section);
  const builtIn = defaults.data?.[section] ?? {};
  // Saved products/FAQs only hold the pages staff changed, so lay them over the built-in copy.
  const initial = !row
    ? builtIn
    : Array.isArray(row.value)
      ? row.value
      : { ...(builtIn as object), ...(row.value as object) };

  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        The text visitors read on the website. Changes go live as soon as you save. Sections you
        have not changed keep the copy built into the website.
      </p>
      <div className="mb-4 flex flex-wrap gap-1">
        {SECTIONS.filter((s) => !page || s.id in page.sections).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[13px] font-semibold",
              section === s.id
                ? "bg-navy text-white"
                : "border border-line bg-white text-muted hover:text-navy",
            )}
          >
            {page ? (page.sections[s.id] ?? s.label) : s.label}
            {savedByKey.has(s.id) && <span className="ml-1.5 text-[10px] text-gold">● edited</span>}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[12px] text-muted">
        {current.help}
        {row && (
          <>
            {" "}
            Last saved {new Date(row.updatedAt).toLocaleString("en-IN")}
            {row.updatedByName ? ` by ${row.updatedByName}` : ""}.
          </>
        )}
      </p>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      <HistoryPanel
        section={section}
        savedAt={row?.updatedAt}
        onRestored={() => queryClient.invalidateQueries({ queryKey: ["site-content"] })}
      />

      <Editor
        key={`${section}:${row?.updatedAt ?? "built-in"}`}
        section={section}
        initial={initial}
        builtIn={builtIn}
        seoPages={(defaults.data?.seoPages ?? []).filter((p) => {
          if (!page) return true;
          const extra = page as { seoPaths?: string[]; seoPrefix?: string };
          return (
            p.path === page.seoPath ||
            (extra.seoPaths ?? []).includes(p.path) ||
            (!!extra.seoPrefix && p.path.startsWith(extra.seoPrefix))
          );
        })}
        listSpecs={(defaults.data?.listSpecs ?? []).filter((s) => !page || s.page === page.listPage)}
        homeSpec={textSpecFor(section, defaults.data)}
        faqPages={scope === "contact" ? ["contact"] : scope === "partner" ? ["partner"] : scope === "city" ? ["mumbai", "thane", "navi-mumbai", "pune"] : undefined}
        busy={save.isPending || reset.isPending}
        canReset={!!row}
        onSave={(value) => save.mutate({ key: section, value })}
        onReset={() => reset.mutate(section)}
      />
    </div>
  );
}

type EditorProps = {
  section: Section;
  seoPages: SeoPage[];
  listSpecs: ListSpec[];
  homeSpec: HomeTextSection[];
  faqPages?: string[] | undefined;
  initial: unknown;
  builtIn: unknown;
  busy: boolean;
  canReset: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
};

function Editor({ section, seoPages, listSpecs, homeSpec, faqPages, initial, builtIn, busy, canReset, onSave, onReset }: EditorProps) {
  const [draft, setDraft] = useState<unknown>(initial);
  const dirty = !same(draft, initial);

  // Only changed pages/products are stored, so untouched ones keep following the website's copy.
  const toSave = () => {
    if (section === "seo") {
      return Object.fromEntries(
        Object.entries(draft as SeoMap).filter(([, e]) => e.title?.trim() || e.description?.trim()),
      );
    }
    if (section === "caseStudies" || section === "bankRates" || section === "testimonials" || section === "customPages") {
      return draft;
    }
    if (section === "trustNumbers") {
      return Object.fromEntries(Object.entries(draft as Figures).filter(([from, to]) => to.trim() && to !== from));
    }
    const d = draft as Record<string, unknown>;
    const b = builtIn as Record<string, unknown>;
    return Object.fromEntries(Object.entries(d).filter(([k, v]) => !same(v, b[k])));
  };

  return (
    <div>
      {(TEXT_SECTIONS as readonly string[]).includes(section) && (
        <HomeTextEditor value={draft as Record<string, string>} spec={homeSpec} onChange={setDraft} />
      )}
      {section === "customPages" && (
        <PagesEditor value={draft as CustomPage[]} onChange={setDraft} />
      )}
      {section === "testimonials" && (
        <TestimonialsEditor value={draft as Testimonial[]} onChange={setDraft} />
      )}
      {section === "trustNumbers" && <FiguresEditor value={draft as Figures} onChange={setDraft} />}
      {section === "lists" && (
        <ListsEditor value={draft as Lists} specs={listSpecs} onChange={setDraft} />
      )}
      {section === "seo" && (
        <SeoEditor value={draft as SeoMap} pages={seoPages} onChange={setDraft} />
      )}
      {section === "bankRates" && <RatesEditor value={draft as BankRates} onChange={setDraft} />}
      {section === "images" && <ImagesEditor value={draft as ImageMap} onChange={setDraft} />}
      {(section === "pageText" || section === "pageText:hi" || section === "pageText:mr") && (
        <PageTextEditor value={draft as PageTextMap} onChange={setDraft} />
      )}
      {section === "siteInfo" && (
        <SiteInfoEditor value={draft as SiteInfo} onChange={setDraft} />
      )}
      {section === "services" && (
        <ServiceEditor value={draft as Record<string, ServiceText>} onChange={setDraft} />
      )}
      {section === "faqs" && (
        <FaqEditor value={draft as Record<string, Faq[]>} only={faqPages} onChange={setDraft} />
      )}
      {section === "products" && (
        <ProductEditor value={draft as Record<string, ProductText>} onChange={setDraft} />
      )}
      {section === "caseStudies" && (
        <CaseStudyEditor value={draft as CaseStudy[]} onChange={setDraft} />
      )}

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <button
          onClick={() => onSave(toSave())}
          disabled={busy || !dirty}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save and publish
        </button>
        {canReset && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Go back to the copy built into the website? Your edits to this section will be lost.",
                )
              ) {
                onReset();
              }
            }}
            disabled={busy}
            className="btn-ghost"
          >
            <RotateCcw className="h-4 w-4" /> Reset to built-in
          </button>
        )}
        {dirty && <span className="text-[12px] text-muted">Unsaved changes</span>}
      </div>
    </div>
  );
}

/** The Home page's headings, buttons and opening statement, grouped as they appear on the page. */
function HomeTextEditor({
  value,
  spec,
  onChange,
}: {
  value: Record<string, string>;
  spec: HomeTextSection[];
  onChange: (v: unknown) => void;
}) {
  if (spec.length === 0) {
    return <p className="text-sm text-muted">The website has not shared its Home page wording yet.</p>;
  }
  return (
    <div className="space-y-5">
      {spec.map((sec) => (
        <div key={sec.id} className="rounded-lg border border-line p-4">
          <p className="text-[13px] font-bold text-navy">{sec.label}</p>
          <p className="mb-3 text-[12px] text-muted">{sec.hint}</p>
          <div className="space-y-3">
            {sec.fields.map((f) => {
              const current = value[f.id] ?? f.text;
              const changed = current !== f.text;
              const set = (text: string) => onChange({ ...value, [f.id]: text });
              return (
                <label key={f.id} className="block">
                  <span className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                    {f.label}
                    {changed && (
                      <button
                        type="button"
                        onClick={() => set(f.text)}
                        className="font-semibold normal-case text-gold hover:underline"
                      >
                        Use the built-in wording
                      </button>
                    )}
                  </span>
                  {f.long ? (
                    <textarea
                      value={current}
                      onChange={(e) => set(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="field mt-1"
                    />
                  ) : (
                    <input
                      value={current}
                      onChange={(e) => set(e.target.value)}
                      maxLength={300}
                      className="field mt-1"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FaqEditor({
  value,
  only,
  onChange,
}: {
  value: Record<string, Faq[]>;
  /** Limits the pages offered (the Contact tab shows only the Contact page's questions). */
  only?: string[] | undefined;
  onChange: (v: unknown) => void;
}) {
  const pages = Object.entries(FAQ_PAGES).filter(([k]) => !only || only.includes(k));
  const [page, setPage] = useState(pages[0]![0]);
  const list = value[page] ?? [];
  const set = (next: Faq[]) => onChange({ ...value, [page]: next });
  return (
    <div>
      <select
        value={page}
        onChange={(e) => setPage(e.target.value)}
        className="field mb-3 max-w-xs"
      >
        {pages.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <div className="space-y-3">
        {list.map((f, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            <div className="flex gap-2">
              <input
                value={f.q}
                onChange={(e) =>
                  set(list.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                }
                placeholder="Question"
                className="field flex-1 font-semibold"
              />
              <button
                onClick={() => set(list.filter((_, j) => j !== i))}
                className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={f.a}
              onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
              placeholder="Answer"
              rows={3}
              className="field mt-2 w-full"
            />
          </div>
        ))}
      </div>
      <button onClick={() => set([...list, { q: "", a: "" }])} className="btn-ghost mt-3">
        <Plus className="h-4 w-4" /> Add question
      </button>
    </div>
  );
}

function LinesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  // Switching product loads a different list; typing keeps the raw text so blank lines survive.
  useEffect(() => {
    setText((t) => (same(lines(t), value) ? t : value.join("\n")));
  }, [value]);
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
        {label} — one per line
      </span>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
        rows={Math.min(10, Math.max(3, value.length + 1))}
        className="field mt-1 w-full"
      />
    </label>
  );
}

function ProductEditor({
  value,
  onChange,
}: {
  value: Record<string, ProductText>;
  onChange: (v: unknown) => void;
}) {
  const slugs = Object.keys(value);
  const [slug, setSlug] = useState(slugs[0] ?? "");
  const p = value[slug];
  if (!p) return <p className="text-sm text-muted">No loan products found.</p>;
  const patch = (next: Partial<ProductText>) => onChange({ ...value, [slug]: { ...p, ...next } });
  return (
    <div className="space-y-3">
      <select value={slug} onChange={(e) => setSlug(e.target.value)} className="field max-w-sm">
        {slugs.map((s) => (
          <option key={s} value={s}>
            {value[s]?.title ?? s}
          </option>
        ))}
      </select>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Tagline</span>
        <input
          value={p.tagline}
          onChange={(e) => patch({ tagline: e.target.value })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">About</span>
        <textarea
          value={p.about}
          onChange={(e) => patch({ about: e.target.value })}
          rows={4}
          className="field mt-1 w-full"
        />
      </label>
      <LinesField label="Features" value={p.features} onChange={(features) => patch({ features })} />
      <LinesField
        label="Eligibility"
        value={p.eligibility}
        onChange={(eligibility) => patch({ eligibility })}
      />
      <LinesField
        label="Documents"
        value={p.documents}
        onChange={(documents) => patch({ documents })}
      />
      <div>
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Key facts (shown as small cards)
        </span>
        <div className="mt-1 space-y-2">
          {p.facts.map((f, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={f.label}
                onChange={(e) =>
                  patch({ facts: p.facts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                }
                placeholder="Label"
                className="field w-1/3"
              />
              <input
                value={f.value}
                onChange={(e) =>
                  patch({ facts: p.facts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                }
                placeholder="Value"
                className="field flex-1"
              />
              <button
                onClick={() => patch({ facts: p.facts.filter((_, j) => j !== i) })}
                className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => patch({ facts: [...p.facts, { label: "", value: "" }] })}
          className="btn-ghost mt-2"
        >
          <Plus className="h-4 w-4" /> Add fact
        </button>
      </div>
    </div>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function CaseStudyEditor({
  value,
  onChange,
}: {
  value: CaseStudy[];
  onChange: (v: unknown) => void;
}) {
  const [index, setIndex] = useState(0);
  const c = value[index];
  const patch = (next: Partial<CaseStudy>) =>
    onChange(value.map((x, i) => (i === index ? { ...x, ...next } : x)));
  const text = (key: keyof CaseStudy, label: string, rows?: number) =>
    c && (
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
        {rows ? (
          <textarea
            value={String(c[key] ?? "")}
            onChange={(e) => patch({ [key]: e.target.value })}
            rows={rows}
            className="field mt-1 w-full"
          />
        ) : (
          <input
            value={String(c[key] ?? "")}
            onChange={(e) => patch({ [key]: e.target.value })}
            className="field mt-1 w-full"
          />
        )}
      </label>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="field max-w-md"
        >
          {value.map((s, i) => (
            <option key={`${s.slug}-${i}`} value={i}>
              {s.visible === false ? "(hidden) " : ""}
              {s.headline || s.slug || "New case study"}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            onChange([
              ...value,
              {
                slug: "",
                group: GROUPS[0]!,
                category: "",
                headline: "",
                amountLabel: "",
                productSlug: value[0]?.productSlug ?? "",
                productLabel: "",
                clientProfile: "",
                challenge: "",
                structuring: "",
                outcome: "",
                visible: true,
              },
            ]);
            setIndex(value.length);
          }}
          className="btn-ghost"
        >
          <Plus className="h-4 w-4" /> Add case study
        </button>
        {c && (
          <button
            onClick={() => {
              if (window.confirm("Delete this case study?")) {
                onChange(value.filter((_, i) => i !== index));
                setIndex(0);
              }
            }}
            className="btn-ghost text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {c && (
        <>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            <input
              type="checkbox"
              checked={c.visible !== false}
              onChange={(e) => patch({ visible: e.target.checked })}
            />
            Show on the website
          </label>
          {text("headline", "Headline")}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Group</span>
              <select
                value={c.group}
                onChange={(e) => patch({ group: e.target.value })}
                className="field mt-1 w-full"
              >
                {GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            {text("category", "Category")}
            {text("amountLabel", "Amount")}
            {text("productLabel", "Loan product name")}
            {text("productSlug", "Loan product link (website slug, e.g. home-loan)")}
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Page address (slug)
              </span>
              <input
                value={c.slug}
                onChange={(e) => patch({ slug: slugify(e.target.value) })}
                onBlur={() => !c.slug && c.headline && patch({ slug: slugify(c.headline) })}
                className="field mt-1 w-full"
              />
            </label>
          </div>
          {text("clientProfile", "Client profile", 3)}
          {text("challenge", "Challenge", 3)}
          {text("structuring", "How we structured it", 3)}
          {text("outcome", "Outcome", 3)}
        </>
      )}
    </div>
  );
}

const INFO_FIELDS: { key: keyof SiteInfo; label: string; hint?: string }[] = [
  { key: "phone", label: "Primary phone", hint: "As shown, e.g. +91 88280 01700" },
  { key: "whatsapp", label: "WhatsApp number", hint: "Digits with country code, e.g. 918828001700" },
  { key: "email", label: "Email" },
  { key: "address", label: "Office address" },
  { key: "hours", label: "Working hours", hint: "e.g. Monday to Saturday · 10:00 AM – 6:00 PM" },
  { key: "reportPrice", label: "Credit report price (₹)", hint: "One flat price for every bureau" },
  { key: "upiId", label: "UPI ID for the payment QR", hint: "e.g. growthcapital@okhdfcbank — leave empty until you have it" },
  { key: "upiName", label: "Name shown on the UPI payment" },
  { key: "facebook", label: "Facebook page link", hint: "Full address, starting with https://. Leave empty to hide the icon." },
  { key: "instagram", label: "Instagram link" },
  { key: "linkedin", label: "LinkedIn link" },
  { key: "youtube", label: "YouTube link" },
  { key: "x", label: "X (Twitter) link" },
  { key: "googleAnalyticsId", label: "Google Analytics ID", hint: "Looks like G-XXXXXXXXXX. Tracking starts as soon as you save." },
  { key: "metaPixelId", label: "Meta (Facebook) Pixel ID", hint: "Digits only. Tracking starts as soon as you save." },
];

function SiteInfoEditor({ value, onChange }: { value: SiteInfo; onChange: (v: unknown) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {INFO_FIELDS.map((f) => (
        <label key={f.key} className={f.key === "address" ? "block sm:col-span-2" : "block"}>
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{f.label}</span>
          <input
            value={String(value[f.key] ?? "")}
            inputMode={f.key === "reportPrice" ? "numeric" : undefined}
            onChange={(e) =>
              onChange({
                ...value,
                [f.key]: f.key === "reportPrice" ? Number(e.target.value.replace(/\D/g, "")) : e.target.value,
              })
            }
            className="field mt-1 w-full"
          />
          {f.hint && <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>}
        </label>
      ))}
      <p className="text-[12px] text-muted sm:col-span-2">
        The extra phone numbers are set under Settings → Organisation → Additional phone numbers.
      </p>
    </div>
  );
}

function ServiceEditor({
  value,
  onChange,
}: {
  value: Record<string, ServiceText>;
  onChange: (v: unknown) => void;
}) {
  const slugs = Object.keys(value);
  const [slug, setSlug] = useState(slugs[0] ?? "");
  const p = value[slug];
  if (!p) return <p className="text-sm text-muted">No services found.</p>;
  const patch = (next: Partial<ServiceText>) => onChange({ ...value, [slug]: { ...p, ...next } });
  return (
    <div className="space-y-3">
      <select value={slug} onChange={(e) => setSlug(e.target.value)} className="field max-w-md">
        {slugs.map((s) => (
          <option key={s} value={s}>
            {value[s]?.title ?? s}
          </option>
        ))}
      </select>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Title</span>
        <input value={p.title} onChange={(e) => patch({ title: e.target.value })} className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Summary</span>
        <textarea value={p.summary} onChange={(e) => patch({ summary: e.target.value })} rows={3} className="field mt-1 w-full" />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Who needs it</span>
        <textarea value={p.whoNeedsIt} onChange={(e) => patch({ whoNeedsIt: e.target.value })} rows={3} className="field mt-1 w-full" />
      </label>
      <LinesField label="Process steps" value={p.process} onChange={(process) => patch({ process })} />
      <LinesField label="Documents" value={p.documents} onChange={(documents) => patch({ documents })} />
    </div>
  );
}

function PageTextEditor({ value, onChange }: { value: PageTextMap; onChange: (v: unknown) => void }) {
  const pages = Object.keys(value);
  if (pages.length === 0) {
    return (
      <p className="rounded-lg bg-bg-light p-4 text-[13px] text-muted">
        Nothing changed yet. To edit wording: sign in here as an admin, open the website page you
        want to change, press <strong>Edit text</strong> (bottom-left), click the wording and save.
      </p>
    );
  }
  const setEdit = (page: string, from: string, to: string | null) => {
    const edits = { ...value[page] };
    if (to === null) delete edits[from];
    else edits[from] = to;
    const next = { ...value, [page]: edits };
    if (Object.keys(edits).length === 0) delete next[page];
    onChange(next);
  };
  return (
    <div className="space-y-5">
      {pages.map((page) => (
        <div key={page}>
          <p className="mb-2 text-[12px] font-bold tracking-wide text-navy uppercase">
            {page === "*" ? "Every page" : page}
          </p>
          <div className="space-y-2">
            {Object.entries(value[page] ?? {}).map(([from, to]) => (
              <div key={from} className="rounded-lg border border-line p-3">
                <p className="text-[12px] text-muted line-through">{from}</p>
                <div className="mt-1 flex gap-2">
                  <textarea
                    value={to}
                    onChange={(e) => setEdit(page, from, e.target.value)}
                    rows={2}
                    className="field flex-1"
                  />
                  <button
                    onClick={() => setEdit(page, from, null)}
                    className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    title="Undo this change"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Version = { id: string; savedAt: string; savedByName: string | null; reset: boolean; size: number };

/** Past saves of this section. Restoring one puts that wording back live (and is itself recorded). */
function HistoryPanel({
  section,
  savedAt,
  onRestored,
}: {
  section: string;
  savedAt: string | undefined;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["site-content-history", section, savedAt],
    queryFn: () => api<Version[]>(`/settings/site-content/${section}/history`),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (id: string) =>
      api(`/settings/site-content/${section}/restore/${id}`, { method: "POST" }),
    onSuccess: () => {
      onRestored();
      setOpen(false);
    },
  });
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!open)} className="btn-ghost">
        <History className="h-4 w-4" /> {open ? "Hide history" : "History / undo"}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
          {history.isPending ? (
            <p className="p-3 text-[13px] text-muted">Loading…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="p-3 text-[13px] text-muted">No saved changes yet.</p>
          ) : (
            <ul className="divide-y divide-line/70 text-[13px]">
              {history.data!.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-semibold text-navy">
                      {new Date(v.savedAt).toLocaleString("en-IN")}
                    </span>
                    <span className="text-muted">
                      {" "}
                      · {v.savedByName ?? "Unknown"} · {v.reset ? "reset to built-in" : "saved"}
                      {i === 0 ? " · current" : ""}
                    </span>
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm("Put this version back? It goes live straight away.")) {
                          restore.mutate(v.id);
                        }
                      }}
                      disabled={restore.isPending}
                      className="text-[12px] font-semibold text-gold-dark hover:underline"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {restore.isError && (
            <p className="p-3 text-[13px] text-red-700">{(restore.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ImagesEditor({ value, onChange }: { value: ImageMap; onChange: (v: unknown) => void }) {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return (
      <p className="rounded-lg bg-bg-light p-4 text-[13px] text-muted">
        No pictures replaced yet. Sign in here as an admin, open the website page, press{" "}
        <strong>Edit text</strong> (bottom-left), then click the picture you want to replace.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(([original, path]) => (
        <div key={original} className="flex items-center gap-3 rounded-lg border border-line p-3">
          <img src={`/crm/api${path}`} alt="" className="h-16 w-24 rounded object-contain ring-1 ring-line" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold text-navy">Replaces</p>
            <p className="truncate text-muted">{original}</p>
          </div>
          <button
            onClick={() => {
              const next = { ...value };
              delete next[original];
              onChange(next);
            }}
            className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
            title="Bring back the original picture"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function RatesEditor({ value, onChange }: { value: BankRates; onChange: (v: unknown) => void }) {
  const patch = (next: Partial<BankRates>) => onChange({ ...value, ...next });
  const setRow = (i: number, next: Partial<RateRow>) =>
    patch({ rows: value.rows.map((r, j) => (j === i ? { ...r, ...next } : r)) });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Rates checked on</span>
          <input
            type="date"
            value={value.asOf}
            onChange={(e) => patch({ asOf: e.target.value })}
            className="field mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
            EMI calculator starting rate (% p.a.)
          </span>
          <input
            inputMode="decimal"
            value={String(value.defaultEmiRate)}
            onChange={(e) => patch({ defaultEmiRate: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
            className="field mt-1 w-full"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Note under the table</span>
        <textarea
          value={value.disclaimer}
          onChange={(e) => patch({ disclaimer: e.target.value })}
          rows={2}
          className="field mt-1 w-full"
        />
      </label>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="border-b border-line bg-bg-light text-[11px] tracking-wide text-muted uppercase">
            <tr>
              {["Loan", "Lender", "Rate from", "Rate to", "Processing fee", "Note", ""].map((h) => (
                <th key={h} className="px-2 py-2 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0">
                {(["product", "bank", "rateFrom", "rateTo", "fee", "note"] as const).map((k) => (
                  <td key={k} className="px-1.5 py-1.5">
                    <input
                      value={r[k] ?? ""}
                      onChange={(e) => setRow(i, { [k]: e.target.value })}
                      placeholder={k === "rateFrom" || k === "rateTo" ? "8.5%" : ""}
                      className="field w-full"
                    />
                  </td>
                ))}
                <td className="px-1.5">
                  <button
                    onClick={() => patch({ rows: value.rows.filter((_, j) => j !== i) })}
                    className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => patch({ rows: [...value.rows, { product: "", bank: "", rateFrom: "" }] })}
        className="btn-ghost"
      >
        <Plus className="h-4 w-4" /> Add a rate
      </button>
    </div>
  );
}

function SeoEditor({
  value,
  pages,
  onChange,
}: {
  value: SeoMap;
  pages: SeoPage[];
  onChange: (v: unknown) => void;
}) {
  const [path, setPath] = useState(pages[0]?.path ?? "/");
  const page = pages.find((p) => p.path === path);
  const entry = value[path] ?? {};
  const set = (next: SeoEntry) => onChange({ ...value, [path]: { ...entry, ...next } });
  const counter = (text: string | undefined, good: number) => {
    const n = (text ?? "").length;
    return <span className={n > good ? "text-red-600" : "text-muted"}>{n}/{good} characters</span>;
  };
  return (
    <div className="space-y-3">
      <select value={path} onChange={(e) => setPath(e.target.value)} className="field max-w-xl">
        {pages.map((p) => (
          <option key={p.path} value={p.path}>
            {value[p.path]?.title || value[p.path]?.description ? "● " : ""}
            {p.label} ({p.path})
          </option>
        ))}
      </select>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Google title — about 60 characters
        </span>
        <input
          value={entry.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={page?.title || "Built-in title"}
          className="field mt-1 w-full"
        />
        <span className="text-[11px]">{counter(entry.title, 60)}</span>
      </label>
      <label className="block">
        <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Google description — about 160 characters
        </span>
        <textarea
          value={entry.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={page?.description || "Built-in description"}
          rows={3}
          className="field mt-1 w-full"
        />
        <span className="text-[11px]">{counter(entry.description, 160)}</span>
      </label>
      <div className="rounded-lg border border-line bg-white p-3">
        <p className="text-[11px] tracking-wide text-muted uppercase">Preview</p>
        <p className="mt-1 text-[18px] leading-tight text-[#1a0dab]">
          {entry.title || page?.title || "Built-in title"}
        </p>
        <p className="text-[12px] text-[#006621]">growthcapitalservices.in{path === "/" ? "" : path}</p>
        <p className="mt-0.5 text-[13px] text-[#545454]">
          {entry.description || page?.description || "Built-in description"}
        </p>
      </div>
    </div>
  );
}

const FIGURES: { token: string; label: string }[] = [
  { token: "75+", label: "Banks and NBFCs in our network" },
  { token: "25+", label: "Loan products" },
  { token: "2017", label: "Year established" },
  { token: "100%", label: "Transparent process" },
];

function FiguresEditor({ value, onChange }: { value: Figures; onChange: (v: unknown) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIGURES.map((f) => (
        <label key={f.token} className="block">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{f.label}</span>
          <input
            value={value[f.token] ?? f.token}
            onChange={(e) => onChange({ ...value, [f.token]: e.target.value })}
            className="field mt-1 w-full"
          />
          <span className="mt-0.5 block text-[11px] text-muted">Currently shown as {f.token} on the site</span>
        </label>
      ))}
    </div>
  );
}

function TestimonialsEditor({ value, onChange }: { value: Testimonial[]; onChange: (v: unknown) => void }) {
  const [index, setIndex] = useState(0);
  const t = value[index];
  const patch = (next: Partial<Testimonial>) =>
    onChange(value.map((x, i) => (i === index ? { ...x, ...next } : x)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={index} onChange={(e) => setIndex(Number(e.target.value))} className="field max-w-md">
          {value.map((s, i) => (
            <option key={i} value={i}>
              {s.visible === false ? "(hidden) " : ""}
              {s.name || "New story"} — {s.product}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            onChange([...value, { name: "", city: "", product: "", rating: 5, quote: "", visible: true }]);
            setIndex(value.length);
          }}
          className="btn-ghost"
        >
          <Plus className="h-4 w-4" /> Add story
        </button>
        {t && (
          <button
            onClick={() => {
              if (window.confirm("Delete this story?")) {
                onChange(value.filter((_, i) => i !== index));
                setIndex(0);
              }
            }}
            className="btn-ghost text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {t && (
        <>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            <input type="checkbox" checked={t.visible !== false} onChange={(e) => patch({ visible: e.target.checked })} />
            Show on the website
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Name</span>
              <input value={t.name} onChange={(e) => patch({ name: e.target.value })} className="field mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">City</span>
              <input value={t.city} onChange={(e) => patch({ city: e.target.value })} className="field mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Loan</span>
              <input value={t.product} onChange={(e) => patch({ product: e.target.value })} className="field mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Rating (1 to 5)</span>
              <input
                inputMode="decimal"
                value={String(t.rating)}
                onChange={(e) => patch({ rating: Math.min(5, Math.max(1, Number(e.target.value.replace(/[^\d.]/g, "")) || 5)) })}
                className="field mt-1 w-full"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">What they said</span>
            <textarea value={t.quote} onChange={(e) => patch({ quote: e.target.value })} rows={3} className="field mt-1 w-full" />
          </label>
        </>
      )}
    </div>
  );
}

const pageSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function PagesEditor({ value, onChange }: { value: CustomPage[]; onChange: (v: unknown) => void }) {
  const [index, setIndex] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const p = value[index];
  const patch = (next: Partial<CustomPage>) =>
    onChange(value.map((x, i) => (i === index ? { ...x, ...next } : x)));

  const upload = async (file: File) => {
    setUploadError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/crm/api/settings/site-images", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
        body,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Upload failed");
      const { path } = (await res.json()) as { path: string };
      patch({ image: path });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {value.length > 0 && (
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))} className="field max-w-md">
            {value.map((x, i) => (
              <option key={i} value={i}>
                {x.published === false ? "(draft) " : ""}
                {x.kind === "post" ? "Article" : "Page"}: {x.title || "Untitled"}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => {
            onChange([
              ...value,
              {
                slug: "",
                title: "",
                kind: "post",
                summary: "",
                body: "",
                date: new Date().toISOString().slice(0, 10),
                published: false,
              },
            ]);
            setIndex(value.length);
          }}
          className="btn-ghost"
        >
          <Plus className="h-4 w-4" /> New article or page
        </button>
        {p && (
          <button
            onClick={() => {
              if (window.confirm("Delete this page for good?")) {
                onChange(value.filter((_, i) => i !== index));
                setIndex(0);
              }
            }}
            className="btn-ghost text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {!p && (
        <p className="rounded-lg bg-bg-light p-4 text-[13px] text-muted">
          Nothing here yet. Press <strong>New article or page</strong> to write one.
        </p>
      )}
      {p && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Title</span>
              <input
                value={p.title}
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={() => !p.slug && p.title && patch({ slug: pageSlug(p.title) })}
                className="field mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Type</span>
              <select
                value={p.kind}
                onChange={(e) => patch({ kind: e.target.value as CustomPage["kind"] })}
                className="field mt-1 w-full"
              >
                <option value="post">Article (listed on Insights, with a date)</option>
                <option value="page">Stand-alone page</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Web address: /p/
              </span>
              <input
                value={p.slug}
                onChange={(e) => patch({ slug: pageSlug(e.target.value) })}
                className="field mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Date</span>
              <input
                type="date"
                value={p.date ?? ""}
                onChange={(e) => patch({ date: e.target.value })}
                className="field mt-1 w-full"
              />
            </label>
            <label className="flex items-center gap-2 pt-5 text-[13px] font-semibold text-navy">
              <input
                type="checkbox"
                checked={p.published !== false}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              Published (untick to keep as a draft)
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-navy">
              <input
                type="checkbox"
                checked={p.showInFooter === true}
                onChange={(e) => patch({ showInFooter: e.target.checked })}
              />
              Link from the website footer
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
              Short summary (shown in the list and on Google)
            </span>
            <textarea
              value={p.summary ?? ""}
              onChange={(e) => patch({ summary: e.target.value })}
              rows={2}
              className="field mt-1 w-full"
            />
          </label>
          <div>
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Cover picture</span>
            <div className="mt-1 flex items-center gap-3">
              {p.image && (
                <img src={`/crm/api${p.image}`} alt="" className="h-16 w-24 rounded object-cover ring-1 ring-line" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
                className="text-[13px]"
              />
              {p.image && (
                <button onClick={() => patch({ image: "" })} className="text-[12px] font-semibold text-muted hover:text-red-600">
                  Remove
                </button>
              )}
            </div>
            {uploadError && <p className="mt-1 text-[12px] text-red-600">{uploadError}</p>}
          </div>
          <label className="block">
            <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Body</span>
            <textarea
              value={p.body}
              onChange={(e) => patch({ body: e.target.value })}
              rows={14}
              className="field mt-1 w-full font-mono text-[13px]"
            />
            <span className="mt-1 block text-[11px] text-muted">
              Leave a blank line between paragraphs. Start a line with ## for a heading, or with - for a
              bullet. **bold** and [link text](https://address) also work.
            </span>
          </label>
        </>
      )}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const Icon = SITE_ICONS[value];
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-light text-navy ring-1 ring-line">
        {Icon ? <Icon className="h-5 w-5" /> : <span className="text-[10px] text-muted">none</span>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field flex-1">
        {value && !SITE_ICONS[value] && <option value={value}>{value}</option>}
        {Object.keys(SITE_ICONS).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Edits the repeated blocks on each page: fields come from the website's own definition of each list. */
function ListsEditor({
  value,
  specs,
  onChange,
}: {
  value: Lists;
  specs: ListSpec[];
  onChange: (v: unknown) => void;
}) {
  const pages = Array.from(new Set(specs.map((s) => s.page)));
  const [page, setPage] = useState(pages[0] ?? "");
  const pageSpecs = specs.filter((s) => s.page === page);
  const [listKey, setListKey] = useState(pageSpecs[0]?.key ?? "");
  const spec = specs.find((s) => s.key === listKey) ?? pageSpecs[0];
  if (!spec) return <p className="text-sm text-muted">No page sections found.</p>;
  const items = value[spec.key] ?? [];
  const set = (next: ListItem[]) => onChange({ ...value, [spec.key]: next });
  const patch = (i: number, key: string, text: string) =>
    set(items.map((it, j) => (j === i ? { ...it, [key]: text } : it)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
  };
  const blank = (): ListItem => {
    const first = items[0] ?? {};
    return Object.fromEntries(spec.fields.map((f) => [f.key, f.kind === "icon" ? (first[f.key] ?? "Sparkles") : ""]));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={page}
          onChange={(e) => {
            setPage(e.target.value);
            setListKey(specs.find((s) => s.page === e.target.value)?.key ?? "");
          }}
          className="field w-48"
        >
          {pages.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={spec.key} onChange={(e) => setListKey(e.target.value)} className="field w-72">
          {pageSpecs.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[12px] text-muted">{spec.hint}</p>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Item {i + 1}</span>
              <span className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1.5 text-muted hover:bg-bg-light disabled:opacity-30" title="Move up">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded p-1.5 text-muted hover:bg-bg-light disabled:opacity-30" title="Move down">
                  <ArrowDown className="h-4 w-4" />
                </button>
                {!spec.fixed && (
                  <button onClick={() => set(items.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {spec.fields.map((f) => (
                <label key={f.key} className={f.kind === "textarea" ? "block sm:col-span-2" : "block"}>
                  <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{f.label}</span>
                  {f.kind === "icon" ? (
                    <IconPicker value={item[f.key] ?? ""} onChange={(v) => patch(i, f.key, v)} />
                  ) : f.kind === "readonly" ? (
                    <p className="mt-1 rounded-md bg-bg-light px-3 py-2 text-[13px] font-semibold text-navy">{item[f.key] ?? ""}</p>
                  ) : f.kind === "yesno" ? (
                    <span className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-navy">
                      <input
                        type="checkbox"
                        checked={item[f.key] === "yes"}
                        onChange={(e) => patch(i, f.key, e.target.checked ? "yes" : "no")}
                      />
                      {item[f.key] === "yes" ? "Yes" : "No"}
                    </span>
                  ) : f.kind === "image" ? (
                    <ImageField value={item[f.key] ?? ""} onChange={(v) => patch(i, f.key, v)} />
                  ) : f.kind === "textarea" ? (
                    <textarea value={item[f.key] ?? ""} onChange={(e) => patch(i, f.key, e.target.value)} rows={2} className="field mt-1 w-full" />
                  ) : (
                    <input value={item[f.key] ?? ""} onChange={(e) => patch(i, f.key, e.target.value)} className="field mt-1 w-full" />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!spec.fixed && (
        <button onClick={() => set([...items, blank()])} className="btn-ghost">
          <Plus className="h-4 w-4" /> Add item
        </button>
      )}
      {spec.fixed && (
        <p className="text-[12px] text-muted">The items here are fixed by the page, so you can reword and reorder them but not add or remove.</p>
      )}
    </div>
  );
}

/** A picture field: shows the current picture, uploads a replacement, or takes a path. */
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [error, setError] = useState("");
  const preview = value.startsWith("/public/") ? `/crm/api${value}` : value;
  const upload = async (file: File) => {
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/crm/api/settings/site-images", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
        body,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Upload failed");
      const { path } = (await res.json()) as { path: string };
      onChange(path);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="grid h-10 w-16 shrink-0 place-items-center rounded bg-bg-light ring-1 ring-line">
        {value ? <img src={preview} alt="" className="max-h-9 max-w-14 object-contain" /> : <span className="text-[10px] text-muted">none</span>}
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
        className="min-w-0 flex-1 text-[12px]"
      />
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
