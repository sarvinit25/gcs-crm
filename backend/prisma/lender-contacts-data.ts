/**
 * Lender relationship-manager directory, from the client's "BL - List of Bank and RM Name" sheet.
 * Cleaned on the way in: phone numbers reduced to 10 digits, emails lower-cased, people listed under
 * more than one loan type merged, obvious typos fixed. Anything that still looked doubtful on the
 * sheet carries a note so staff confirm it before relying on it.
 */
export type LenderContactSeed = {
  lender: string;
  name: string;
  designation: string;
  phone: string | null;
  email: string | null;
  segments: string[];
  notes: string | null;
};

/** Lenders on the sheet that weren't already in the CRM. Internal only — never shown on the public website. */
export const NEW_LENDERS: { name: string; type: "BANK" | "NBFC" }[] = [
  {"name": "Bajaj Markets", "type": "NBFC"},
  {"name": "L&T Finance", "type": "NBFC"},
  {"name": "Fullerton India", "type": "NBFC"},
  {"name": "UGRO Capital", "type": "NBFC"},
  {"name": "Clix Capital", "type": "NBFC"},
  {"name": "Edelweiss", "type": "NBFC"},
  {"name": "Ashv Finance", "type": "NBFC"},
  {"name": "SMC Finance", "type": "NBFC"},
  {"name": "Credit Saison", "type": "NBFC"},
  {"name": "Ambit", "type": "NBFC"},
  {"name": "Dhanversha", "type": "NBFC"},
  {"name": "Unity Bank", "type": "BANK"},
  {"name": "MAS Finance", "type": "NBFC"},
  {"name": "Arka Fincap", "type": "NBFC"},
  {"name": "Protium", "type": "NBFC"},
  {"name": "IIFL Finance", "type": "NBFC"},
  {"name": "Indifi", "type": "NBFC"},
  {"name": "Muthoot Finance", "type": "NBFC"},
  {"name": "HDB Financial Services", "type": "NBFC"},
  {"name": "KrazyBee", "type": "NBFC"},
  {"name": "InCred", "type": "NBFC"},
  {"name": "NeoGrowth", "type": "NBFC"},
  {"name": "Utkarsh", "type": "BANK"},
  {"name": "FlexiLoans", "type": "NBFC"},
  {"name": "Ratnaafin", "type": "NBFC"},
];

export const LENDER_CONTACTS: LenderContactSeed[] = [
  {"lender": "HDFC Bank", "name": "Rahul Astana", "designation": "Sales Manager", "phone": "9820592765", "email": "rahul.asthana1@hdfcbank.com", "segments": ["Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "ICICI Bank", "name": "Sachin Mishra", "designation": "Sales Manager", "phone": "7977114209", "email": "sachin.mishra6@icicibank.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Bajaj Finserv", "name": "Vishal Bajaj", "designation": "Sales Manager", "phone": "7666994656", "email": "vishal.kadam5@bajajfinserv.in", "segments": ["Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "Bajaj Finserv", "name": "Tanmay Dandekar", "designation": "Sales Manager", "phone": "8291774356", "email": "tanmay.dandekar@bizsupporta.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Bajaj Markets", "name": "Prashant Kesharwani", "designation": "Sales Manager", "phone": "9993560829", "email": "prashant.kesharwani1@bajajmarket.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "Tata Capital", "name": "Raj Kumar Gupta", "designation": "Sales Manager", "phone": "9768724216", "email": "rajkumar4.gupta@tatacapital.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Tata Capital", "name": "Ram Pal", "designation": "Sales Manager", "phone": "9833412305", "email": "rampal.sharma@tatacapital.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Kotak Mahindra", "name": "Rohit Bhise", "designation": "Sales Manager", "phone": "9029086654", "email": "rohit.bhise1@kotak.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Kotak Mahindra", "name": "Prajakta Pawar", "designation": "Sales Manager", "phone": "8424877938", "email": "prajakta.pawar3@kotak.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Poonawalla Fincorp", "name": "Prashant Nimbre", "designation": "Sales Manager", "phone": "9820938098", "email": "prashant.nimbre@poonawallafincorp.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Axis Bank", "name": "Bhavika Chavan", "designation": "Sales Manager", "phone": "8657070223", "email": "bhavika.chavan@axisbank.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Aditya Birla Capital", "name": "Anil Singh", "designation": "Sales Manager", "phone": "9820265998", "email": "anil.singh@adityabirlacapital.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "IDFC First Bank", "name": "Sanket Gandhi", "designation": "Sales Manager", "phone": "7738528879", "email": "sanket.gandhi@idfcfirstbank.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "L&T Finance", "name": "Manish Yadav", "designation": "Sales Manager", "phone": "9930068473", "email": "ashishkrajak@ltfs.com", "segments": ["Business Loan"], "notes": "The email on the sheet doesn't match this person's name — please confirm it before relying on it."},
  {"lender": "L&T Finance", "name": "Hemant Rai", "designation": "Sales Manager", "phone": "7083546318", "email": "hemantrai@ltfs.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Yes Bank", "name": "Mohit Ahuja", "designation": "Sales Manager", "phone": "9111144467", "email": "mohit.ahuja@yes.bank.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "Fullerton India", "name": "Naresh Bhandari", "designation": "Sales Manager", "phone": "9987500268", "email": "naresh.bhandari@fullertonindia.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Deutsche Bank", "name": "Paresh Borkar", "designation": "Sales Manager", "phone": "9004905065", "email": "paresh.borkar@db.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Standard Chartered", "name": "Neha", "designation": "Sales Manager", "phone": "8369122426", "email": "neha.bipinsingh@sc.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "IndusInd Bank", "name": "Punit Vakharia", "designation": "Sales Manager", "phone": "8655160985", "email": "vakharia.punit@indusind.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Clix Capital", "name": "Pratham", "designation": "Sales Manager", "phone": "8928272955", "email": "pratham.yadav@clix.capital", "segments": ["Business Loan"], "notes": null},
  {"lender": "Godrej Capital", "name": "Nikunj Jethwa", "designation": "Sales Manager", "phone": "9768535117", "email": "nikunj.jethwa@godrejcapital.com", "segments": ["Business Loan", "Overdraft"], "notes": null},
  {"lender": "Godrej Capital", "name": "Sneha Mishra", "designation": "Sales Manager", "phone": "9370305167", "email": "sneha.mishra@ext.godrejcapital.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Edelweiss", "name": "Rahul Bhalerao", "designation": "Sales Manager", "phone": "9773157327", "email": "rahulm.bhalerao@eclf.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Ashv Finance", "name": "Rohan", "designation": "Sales Manager", "phone": "9870176428", "email": "rohan.s@ashvfinance.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "SMC Finance", "name": "Yogesh Devadiga", "designation": "Sales Manager", "phone": "9892940059", "email": "yogeshdevadiga@smcfinance.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Axis Finance", "name": "Suraj Khopkar", "designation": "Sales Manager", "phone": "7738408044", "email": "suraj.khopkar@axisfinance.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "Credit Saison", "name": "Rajesh Pal", "designation": "Sales Manager", "phone": "7387931701", "email": "rajesh.pal@creditsaison-in.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Hero FinCorp", "name": "Vishal Takkekar", "designation": "Sales Manager", "phone": "9049357747", "email": "vishal.takkekar@herofincorp.com", "segments": ["Business Loan", "Small Business Loan"], "notes": null},
  {"lender": "Dhanversha", "name": "Pavan Upadhyay", "designation": "Sales Manager", "phone": "9004279365", "email": "pawan@trucapfinance.com", "segments": ["Business Loan"], "notes": "The email on the sheet doesn't match this person's name — please confirm it before relying on it."},
  {"lender": "Unity Bank", "name": "Vijay Kuril", "designation": "Sales Manager", "phone": "9870227655", "email": "vijay.kuril@unitybank.co.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "Cholamandalam", "name": "Nikesh", "designation": "Sales Manager", "phone": "8928622969", "email": "nikeshgunjal@chola1.murugappa.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "MAS Finance", "name": "Vinayak", "designation": "Sales Manager", "phone": "9833015498", "email": "vinayak_gode@mas.co.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "Shriram Finance", "name": "Vishal Barodiya", "designation": "Sales Manager", "phone": "9654778249", "email": "vishal.k97@shriramfinance.in", "segments": ["Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "Arka Fincap", "name": "Mayuri Chavan", "designation": "Sales Manager", "phone": "9987109848", "email": "mayuri.chavan@arkafincap.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Protium", "name": "Ajay Darshanam", "designation": "Sales Manager", "phone": "9619096556", "email": "ajay.darshanam@protium.co.in", "segments": ["Business Loan"], "notes": null},
  {"lender": "IIFL Finance", "name": "Sanjay", "designation": "Sales Manager", "phone": null, "email": null, "segments": ["Business Loan"], "notes": "No phone number on the sheet."},
  {"lender": "Piramal Finance", "name": "Sunil Tadge", "designation": "Sales Manager", "phone": "8850766352", "email": "sunil.tadge2@piramal.com", "segments": ["Business Loan", "Small Business Loan"], "notes": null},
  {"lender": "Indifi", "name": "Amit Kalagonda", "designation": "Sales Manager", "phone": "8850479418", "email": "amit.kalgonda@indifi.com", "segments": ["Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "Muthoot Finance", "name": "Vijay Mourya", "designation": "Sales Manager", "phone": "8850479568", "email": "vijay.maurya@muthootgroup.com", "segments": ["Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "Mahindra Finance", "name": "Hitesh Hiwale", "designation": "Sales Manager", "phone": "8655713364", "email": "hitesh.hiwale@mahindrafinance.com", "segments": ["Business Loan"], "notes": null},
  {"lender": "Bandhan Bank", "name": "Asif Khan", "designation": "Sales Manager", "phone": "9372666053", "email": "asifkhan274522@gmail.com", "segments": ["Business Loan"], "notes": "Personal email address, not a company one."},
  {"lender": "Aditya Birla Capital", "name": "Pranjali", "designation": "Sales Manager", "phone": "7710991838", "email": "pranjali.yerunkar@adityabirlacapital.com", "segments": ["Small Business Loan"], "notes": null},
  {"lender": "Tata Capital", "name": "Mahesh", "designation": "Sales Manager", "phone": "8850706735", "email": "mahesh.dhadke@tatacapital.com", "segments": ["Small Business Loan"], "notes": null},
  {"lender": "HDB Financial Services", "name": "Amol Patil", "designation": "Sales Manager", "phone": "9762631222", "email": "bm.panvel@hdbfs.com", "segments": ["Small Business Loan"], "notes": "The email on the sheet doesn't match this person's name — please confirm it before relying on it."},
  {"lender": "Godrej Capital", "name": "Sonali Mishra", "designation": "Sales Manager", "phone": "9579216998", "email": "sonali.mishra1@godrejcapital.com", "segments": ["Small Business Loan"], "notes": null},
  {"lender": "KrazyBee", "name": "Rahul Sharma", "designation": "Sales Manager", "phone": "9769662750", "email": "rahulkanhaiyalal@krazybee.com", "segments": ["Small Business Loan"], "notes": "Also: opsleads@krazybee.com The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "InCred", "name": "Kunal", "designation": "Sales Manager", "phone": "8149438202", "email": "kunal.yelve@incred.com", "segments": ["Small Business Loan"], "notes": null},
  {"lender": "Utkarsh", "name": "Nilesh", "designation": "Sales Manager", "phone": "6387339969", "email": "ny134298@gmail.com", "segments": ["Small Business Loan"], "notes": "The email on the sheet doesn't match this person's name — please confirm it before relying on it. Personal email address, not a company one."},
  {"lender": "FlexiLoans", "name": "Pravin Nalawade", "designation": "Sales Manager", "phone": "9769941421", "email": "pravin.nalawade@flexiloans.com", "segments": ["Small Business Loan"], "notes": null},
  {"lender": "Ratnaafin", "name": "Sunny Gurbani", "designation": "Sales Manager", "phone": "9860228274", "email": "sunny.gurbani@ratnaafin.com", "segments": ["Small Business Loan"], "notes": "Email domain was mistyped on the sheet (\",com\") and has been corrected — please confirm."},
  {"lender": "Protium", "name": "Dhiraj Kumar", "designation": "Sales Manager", "phone": "7021335909", "email": "dhiraj.chaurasia@protium.co.in", "segments": ["Small Business Loan"], "notes": "The name and the email are spelled slightly differently on the sheet — please confirm the spelling."},
  {"lender": "Cholamandalam", "name": "Raj Kumar", "designation": "Sales Manager", "phone": "9768255291", "email": "rajkumarry@chola1.murugappa.com", "segments": ["Overdraft"], "notes": null},
  {"lender": "UGRO Capital", "name": "Roshan Thorat", "designation": "Sales Manager", "phone": "9821294695", "email": "roshan.thorat@ugrocapital.com", "segments": ["Machinery Loan"], "notes": null},
  {"lender": "Bajaj Housing", "name": "Ajay Rawat", "designation": "Sales Manager", "phone": null, "email": "ajay.rawat2@bajajhousing.biz", "segments": ["Secured Loan"], "notes": "No phone number on the sheet."},
];
