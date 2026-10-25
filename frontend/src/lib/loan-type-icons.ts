import {
  Banknote,
  Briefcase,
  Building2,
  Car,
  CircleHelp,
  Coins,
  Factory,
  Gem,
  GraduationCap,
  HardHat,
  Home,
  Landmark,
  Percent,
  Receipt,
  ShieldCheck,
  FileText,
  Stethoscope,
  TrendingUp,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The pictures a loan type can carry; the key is what gets stored with the loan type. */
export const LOAN_TYPE_ICONS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: Home },
  building: { label: "Property", icon: Building2 },
  construction: { label: "Construction", icon: HardHat },
  landmark: { label: "Bank / rental", icon: Landmark },
  percent: { label: "Rate / transfer", icon: Percent },
  briefcase: { label: "Business", icon: Briefcase },
  banknote: { label: "Cash loan", icon: Banknote },
  coins: { label: "Working capital", icon: Coins },
  wallet: { label: "Overdraft / credit line", icon: Wallet },
  factory: { label: "Machinery", icon: Factory },
  shield: { label: "Guarantee", icon: ShieldCheck },
  file: { label: "Trade document", icon: FileText },
  receipt: { label: "Bills", icon: Receipt },
  user: { label: "Personal", icon: User },
  graduation: { label: "Education", icon: GraduationCap },
  car: { label: "Car", icon: Car },
  truck: { label: "Commercial vehicle", icon: Truck },
  trending: { label: "Securities / funds", icon: TrendingUp },
  stethoscope: { label: "Professional", icon: Stethoscope },
  gem: { label: "Gold / private", icon: Gem },
};

export const loanTypeIcon = (key: string | null | undefined): LucideIcon =>
  (key && LOAN_TYPE_ICONS[key]?.icon) || CircleHelp;
