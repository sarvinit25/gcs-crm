// Which language to answer in. Decided in code from what the customer TYPED (not from what they tapped, because the
// labels on our buttons are ours), so the reply does not slide back into English halfway through.

export type Language = "en" | "hinglish" | "hi" | "mr" | "mr-roman";

export const LANGUAGE_NAME: Record<Language, string> = {
  en: "English",
  hinglish: "Hinglish (Hindi written in English letters)",
  hi: "Hindi in Devanagari script",
  mr: "Marathi in Devanagari script",
  "mr-roman": "Marathi written in English letters",
};

const DEVANAGARI = /[ऀ-ॿ]/;
const HINDI_DEVANAGARI = /(है|हैं|मैं|मुझे|चाहिए|आप |आपका|आपकी|नहीं|हाँ|हां|क्या|कितना|कितने|मेरा|मेरी|हमें|लोन)/;
const MARATHI_DEVANAGARI = /(आहे|आहेत|मी |मला|तुम्ही|तुमचे|तुम्हाला|हवे|पाहिजे|कर्ज|नाही|होय|काय|कसे|किती|माझे|आम्ही)/;
const MARATHI_ROMAN = /\b(mala|pahije|pahije|aahe|ahe|aahet|tumhi|tumhala|kiti|kasa|kase|majhe|mazhe|amhi|karj|nahi ahe|hoy)\b/i;
const HINGLISH = /\b(mujhe|mera|meri|mere|main|hoon|hun|hai|hain|nahi|nahin|haan|aap|aapka|aapko|kya|kyun|kaise|kitna|kitne|chahiye|chahta|chahti|rehta|rehti|karna|karni|karo|liye|lena|dena|paisa|rupaye|bhai|ji|batao|bataye|bataiye|abhi|kaam|ghar|dukaan|dukan)\b/i;

/** The language of one typed message, or null if it says nothing either way (a short English reply such as "ok"). */
export function languageOfMessage(text: string): Language | null {
  if (DEVANAGARI.test(text)) {
    if (MARATHI_DEVANAGARI.test(text)) return "mr";
    // a bare word or two in Devanagari (a name, a place, a course) does not show which language they write in
    return HINDI_DEVANAGARI.test(text) ? "hi" : null;
  }
  if (MARATHI_ROMAN.test(text)) return "mr-roman";
  if (HINGLISH.test(text)) return "hinglish";
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words >= 3 ? "en" : null;
}

/** The language for the next reply: that of the customer's latest typed message that shows one; English if none does. */
export function detectLanguage(turns: { role: string; content: string }[]): Language {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role !== "user" || t.content.startsWith("(tapped)")) continue;
    const found = languageOfMessage(t.content);
    if (found) return found;
  }
  return "en";
}
