let state = null;
let authEnabled = false;
let sensitiveLocked = false;
let currentUser = { role: "admin", canSeeAdvertising: true, canManageStudentData: true };
let storageInfo = null;
let pendingRestore = null;
let pendingMetaFile = null;
let toastTimer = null;
let editingAgentId = "";
let editingStudentId = "";
let paymentStudentId = "";
let detailStudentId = "";
let plannerSuggestions = [];
let plannerSelectedDay = localStorage.getItem("cmcg-planner-day") || "monday";
let plannerView = "plan";
let sessionsGroupId = "";

const pageMeta = {
  dashboard: ["Overview", "Your advertising and enrollment results at a glance."],
  performance: ["Performance", "Compare ads, ad sets, campaigns, objectives, and agents."],
  outcomes: ["Outcomes", "Appointments, visits, and registered students."],
  groups: ["Groupes & paiements", "Planning, capacité, inscriptions, avances et historique étudiant."],
  students: ["Étudiants", "Filtrez par formation, groupe, statut ou paiement, puis gérez chaque étudiant."],
  agents: ["Agents", "Manage automatic ad-set assignment."],
  reports: ["Rapports", "Rapport détaillé par agent: publicité, ROI, closing, étudiants et paiements."],
  data: ["Import & data", "Synchronize Meta Ads and protect your CRM data."],
};
const outcomeMeta = {
  booked: { label: "Booked appointment", short: "Booked", className: "booked" },
  showed: { label: "Showed, no registration", short: "Showed", className: "showed" },
  registered: { label: "Registered student", short: "Registered", className: "registered" },
};
const groupLabels = { ad: "Ad", adSet: "Ad set", campaign: "Campaign", agent: "Agent" };
const periodLabels = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", thisWeek: "This week", thisMonth: "This month", thisYear: "This year", lifetime: "Lifetime", custom: "Custom" };
const WEEK_DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];
const PLANNER_TIME_SLOTS = [
  ["09:00", "11:00"],
  ["10:00", "12:00"],
  ["12:00", "14:00"],
  ["14:00", "16:00"],
  ["16:00", "18:00"],
  ["18:00", "20:00"],
];
const DAY_ALIASES = {
  monday: ["monday", "mon", "lundi", "الإثنين", "الاثنين"],
  tuesday: ["tuesday", "tue", "mardi", "الثلاثاء"],
  wednesday: ["wednesday", "wed", "mercredi", "الأربعاء", "الاربعاء"],
  thursday: ["thursday", "thu", "jeudi", "الخميس"],
  friday: ["friday", "fri", "vendredi", "الجمعة"],
  saturday: ["saturday", "sat", "samedi", "السبت"],
  sunday: ["sunday", "sun", "dimanche", "الأحد", "الاحد"],
};
const ar = {
  "CMCG CRM": "نظام CMCG",
  "Ads to enrollment": "من الإعلان إلى التسجيل",
  "Admin": "مدير",
  "Sales agent": "مستشار تجاري",
  "Overview": "نظرة عامة",
  "Performance": "الأداء",
  "Outcomes": "النتائج",
  "Agents": "المستشارون",
  "Import & data": "الاستيراد والبيانات",
  "Groupes & paiements": "الأفواج والأداءات",
  "Your advertising and enrollment results at a glance.": "ملخص نتائج الإعلانات والتسجيلات في لمحة واحدة.",
  "Compare ads, ad sets, campaigns, objectives, and agents.": "قارن الإعلانات، المجموعات الإعلانية، الحملات، الأهداف، والمستشارين.",
  "Appointments, visits, and registered students.": "المواعيد، الزيارات، والطلبة المسجلون.",
  "Planning, capacité, inscriptions, avances et historique étudiant.": "تخطيط الأفواج، الطاقة الاستيعابية، التسجيلات، التسبيقات، وتتبع الطالب.",
  "Synchronize Meta Ads and protect your CRM data.": "زامن تقارير Meta Ads واحمِ بيانات النظام.",
  "Import daily report": "استيراد التقرير اليومي",
  "Import report": "استيراد التقرير",
  "Refresh CRM data": "تحديث بيانات النظام",
  "Refresh": "تحديث",
  "Loading data…": "جاري تحميل البيانات…",
  "Checking…": "جاري التحقق…",
  "Storage": "التخزين",
  "CMCG · Tangier": "CMCG · طنجة",
  "Public access is not protected.": "الدخول العام غير محمي.",
  "Add CRM_USER and CRM_PASSWORD in Hostinger environment variables.": "أضف CRM_USER و CRM_PASSWORD في متغيرات Hostinger.",
  "Deployment-safe storage is not configured.": "التخزين المناسب للإنتاج غير مفعّل.",
  "Connect MySQL before entering production data.": "اربط MySQL قبل إدخال بيانات حقيقية.",
  "Reporting period": "الفترة الزمنية",
  "Last 7 days": "آخر 7 أيام",
  "Today": "اليوم",
  "Yesterday": "أمس",
  "This week": "هذا الأسبوع",
  "This month": "هذا الشهر",
  "This year": "هذه السنة",
  "Lifetime": "كل الفترة",
  "Custom": "فترة مخصصة",
  "Preset": "اختيار سريع",
  "From": "من",
  "To": "إلى",
  "Today’s picture": "صورة اليوم",
  "From messages to students": "من الرسائل إلى الطلبة",
  "See what is working, then record a result in seconds.": "اعرف ما يعمل جيداً، ثم سجّل النتيجة في ثوانٍ.",
  "Add outcome": "إضافة نتيجة",
  "Visible trend graph": "رسم بياني واضح",
  "Performance direction": "اتجاه الأداء",
  "Click the cards below to add or remove lines. Cost / registered is reversed so up means better.": "اضغط على البطاقات لإضافة أو حذف الخطوط. تكلفة التسجيل معكوسة: الصعود يعني تحسناً.",
  "Spend": "الصرف",
  "Messages": "الرسائل",
  "Booked": "المواعيد",
  "Visited": "الزيارات",
  "Registered": "المسجلون",
  "Cost / registered": "تكلفة التسجيل",
  "Conversion": "التحويل",
  "Outcome flow": "مسار النتائج",
  "Registered students are included in total visits.": "الطلبة المسجلون محسوبون ضمن إجمالي الزيارات.",
  "Needs attention": "يحتاج انتباهاً",
  "Assignment health": "سلامة التعيين",
  "Best-performing ads": "أفضل الإعلانات أداءً",
  "Ranked by quality across appointments, visits, and registrations.": "مرتبة حسب الجودة عبر المواعيد والزيارات والتسجيلات.",
  "View all performance": "عرض كل الأداء",
  "Agent results": "نتائج المستشارين",
  "Outcomes credited to each agent and their matched ad sets.": "النتائج المنسوبة لكل مستشار ومجموعاته الإعلانية المطابقة.",
  "Split testing": "اختبار المقارنات",
  "Advertising performance": "أداء الإعلانات",
  "Compare the same creative across agents, ad sets, campaigns, and objectives.": "قارن نفس الإبداع عبر المستشارين والمجموعات والحملات والأهداف.",
  "Ads": "الإعلانات",
  "Ad sets": "المجموعات الإعلانية",
  "Campaigns": "الحملات",
  "All agents": "كل المستشارين",
  "All objectives": "كل الأهداف",
  "All campaigns": "كل الحملات",
  "Agent": "المستشار",
  "Objective": "الهدف",
  "Campaign": "الحملة",
  "Search": "بحث",
  "Clear all filters": "مسح كل الفلاتر",
  "Sort by": "الترتيب حسب",
  "Columns": "الأعمدة",
  "Business quality": "جودة العمل",
  "Status": "الحالة",
  "Cost / booked": "تكلفة الموعد",
  "Cost / visit": "تكلفة الزيارة",
  "Cost / registration": "تكلفة التسجيل",
  "Manual results": "النتائج اليدوية",
  "Outcome log": "سجل النتائج",
  "Record only the three results Facebook cannot know.": "سجّل فقط النتائج الثلاث التي لا يعرفها فيسبوك.",
  "Booked appointment": "موعد محجوز",
  "They said they will visit the center.": "قال إنه سيزور المركز.",
  "Showed, no registration": "زار ولم يسجل",
  "They visited but did not register.": "زار المركز لكنه لم يسجل.",
  "Registered student": "طالب مسجل",
  "Registration also counts as a visit.": "التسجيل يُحسب أيضاً كزيارة.",
  "Gestion école · تدبير المركز": "تدبير المركز",
  "Formation · تكوين": "التكوين",
  "Groupe · فوج": "الفوج",
  "Inscription étudiant · تسجيل": "تسجيل طالب",
  "Historique étudiant · تتبع": "تتبع الطالب",
  "Groupes, étudiants et paiements": "الأفواج، الطلبة، والأداءات",
  "Planning des formations, capacité, inscriptions, avances et historique étudiant.": "تخطيط التكوينات، الطاقة الاستيعابية، التسجيلات، التسبيقات، وتتبع الطالب.",
  "Lien direct sécurisé": "رابط آمن مباشر",
  "+ Formation": "+ تكوين",
  "+ Groupe": "+ فوج",
  "+ Inscrire étudiant": "+ تسجيل طالب",
  "Zone étudiants verrouillée.": "منطقة الطلبة مقفلة.",
  "Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir des noms, téléphones ou paiements.": "قم بإعداد بيانات الدخول على Hostinger قبل إدخال الأسماء أو الهواتف أو الأداءات.",
  "Assistant planning · مساعد التخطيط": "مساعد التخطيط",
  "Ajouter une formation sans casser le planning": "إضافة تكوين دون إرباك البرمجة",
  "Choisissez une formation ou tapez une nouvelle. Le CRM suggère les créneaux les moins chargés, avec option nidam shift matin/soir.": "اختر تكويناً موجوداً أو اكتب تكويناً جديداً. يقترح النظام أقل الأوقات ازدحاماً مع خيار نظام الشيفت صباحاً/مساءً.",
  "Proposer un planning": "اقتراح برمجة",
  "Charger planning image": "تحميل برمجة الصورة",
  "Formation existante": "تكوين موجود",
  "Nouvelle formation": "تكوين جديد",
  "si besoin": "عند الحاجة",
  "Durée": "المدة",
  "Capacité cible": "الطاقة المستهدفة",
  "Mode": "النظام",
  "Groupe fixe": "فوج ثابت",
  "Nidam shift matin/soir": "نظام شيفت صباح/مساء",
  "Formation": "التكوين",
  "Horaire": "التوقيت",
  "Paiement": "الأداء",
  "Tous les paiements": "كل الأداءات",
  "Payé totalement": "مدفوع بالكامل",
  "Reste à payer": "الباقي للدفع",
  "Aucun paiement": "لا يوجد أداء",
  "Recherche": "بحث",
  "Aperçu capacité des groupes": "نظرة على طاقة الأفواج",
  "Voyez les groupes pleins, les places restantes, et les shifts disponibles.": "اطّلع على الأفواج الممتلئة، المقاعد المتبقية، والشيفتات المتاحة.",
  "Paiements": "الأداءات",
  "Restes à payer": "المبالغ المتبقية",
  "Les étudiants avec solde restant apparaissent en premier.": "الطلبة الذين لديهم مبلغ متبقٍ يظهرون أولاً.",
  "Étudiants": "الطلبة",
  "Registre étudiant": "سجل الطلبة",
  "Cliquez sur un étudiant pour voir inscription, paiements et historique.": "اضغط على الطالب لرؤية التسجيل، الأداءات، والتاريخ.",
  "Étudiant": "الطالب",
  "Groupe": "الفوج",
  "Inscrit le": "تاريخ التسجيل",
  "Payé": "مدفوع",
  "Reste": "الباقي",
  "Automatic assignment": "التعيين التلقائي",
  "Sales agents": "المستشارون التجاريون",
  "If an ad set contains an agent’s full name, results are assigned automatically—case does not matter.": "إذا ظهر اسم المستشار كاملاً في اسم المجموعة الإعلانية، يتم التعيين تلقائياً دون حساسية لحجم الحروف.",
  "New agent": "مستشار جديد",
  "Add a sales agent": "إضافة مستشار تجاري",
  "Use the name that appears inside your Meta ad set names.": "استعمل الاسم الذي يظهر داخل أسماء مجموعات Meta الإعلانية.",
  "Agent name": "اسم المستشار",
  "WhatsApp number": "رقم واتساب",
  "optional": "اختياري",
  "Add agent": "إضافة المستشار",
  "How matching works": "طريقة المطابقة",
  "Agent directory": "دليل المستشارين",
  "Unassigned ad sets": "مجموعات إعلانية غير معينة",
  "Daily synchronization": "المزامنة اليومية",
  "Import Meta Ads report": "استيراد تقرير Meta Ads",
  "Upload the saved CSV template. Existing rows update; new campaigns, ad sets, and ads are created automatically.": "ارفع قالب CSV المحفوظ. الصفوف الموجودة تُحدّث، والحملات والمجموعات والإعلانات الجديدة تُنشأ تلقائياً.",
  "Meta Ads CSV": "ملف Meta Ads CSV",
  "Drop today’s report here": "ضع تقرير اليوم هنا",
  "All raw columns and IDs are stored safely but hidden from the normal view.": "كل الأعمدة والمعرّفات الأصلية تُحفظ بأمان لكنها مخفية من العرض العادي.",
  "Choose CSV file": "اختيار ملف CSV",
  "Import and sync": "استيراد ومزامنة",
  "Safe to repeat": "آمن عند التكرار",
  "What every import does": "ماذا يفعل كل استيراد",
  "Updates spend and messages instead of duplicating them.": "يحدّث الصرف والرسائل بدل تكرارها.",
  "Adds newly launched campaigns, ad sets, and ads.": "يضيف الحملات والمجموعات والإعلانات الجديدة.",
  "Keeps manual outcomes and agent assignments.": "يحافظ على النتائج اليدوية وتعيينات المستشارين.",
  "Uses Meta IDs even when names change.": "يعتمد معرّفات Meta حتى عند تغيير الأسماء.",
  "Import history": "تاريخ الاستيراد",
  "Storage and backup": "التخزين والنسخ الاحتياطي",
  "Current storage": "التخزين الحالي",
  "Backup": "نسخة احتياطية",
  "Download all CRM data": "تحميل كل بيانات النظام",
  "Download backup": "تحميل نسخة احتياطية",
  "Recovery": "استرجاع",
  "Restore a backup": "استرجاع نسخة احتياطية",
  "Reset CRM data": "تصفير بيانات النظام",
  "System status": "حالة النظام",
  "Record inventory": "جرد السجلات",
  "Add training": "إضافة تكوين",
  "Add group": "إضافة فوج",
  "Register student": "تسجيل طالب",
  "Edit student": "تعديل الطالب",
  "Add payment": "إضافة أداء",
  "Student history": "تاريخ الطالب",
  "Close": "إغلاق",
  "Cancel": "إلغاء",
  "Save": "حفظ",
  "Save training": "حفظ التكوين",
  "Save group": "حفظ الفوج",
  "Save student": "حفظ الطالب",
  "Save payment": "حفظ الأداء",
  "Language": "اللغة",
};

const arDynamic = [
  [/^(\d+) ads$/, "$1 إعلان"],
  [/^(\d+) ad sets$/, "$1 مجموعة إعلانية"],
  [/^(\d+) campaigns$/, "$1 حملة"],
  [/^(\d+) agents$/, "$1 مستشار"],
  [/^(\d+) groups$/, "$1 فوج"],
  [/^(\d+) students$/, "$1 طالب"],
  [/^(\d+) payments$/, "$1 أداء"],
  [/^(\d+) imports$/, "$1 استيراد"],
  [/^(\d+) outcome(?:s)?$/, "$1 نتيجة"],
  [/^(\d+) places libres$/, "$1 مقاعد شاغرة"],
  [/^(\d+) spots left$/, "$1 مقاعد شاغرة"],
  [/^Capacité proposée: (.+) étudiants$/, "الطاقة المقترحة: $1 طالب"],
  [/^(.+) rows synced · (.+) new ads · (.+) updated$/, "تمت مزامنة $1 صف · $2 إعلانات جديدة · $3 تحديث"],
  [/^Sales · (.+)$/, "حساب المستشار · $1"],
  [/^Saved (.+)$/, "تم الحفظ $1"],
  [/^(.+) remaining$/, "الباقي $1"],
  [/^(.+) reste$/, "الباقي $1"],
  [/^(.+) paid$/, "مدفوع $1"],
  [/^(.+) payé$/, "مدفوع $1"],
];

Object.assign(ar, {
  "Name": "الاسم",
  "Quality": "الجودة",
  "Total visits": "إجمالي الزيارات",
  "Agent closing": "إغلاق المستشار",
  "Reach": "الوصول",
  "Frequency": "التكرار",
  "Link clicks": "نقرات الرابط",
  "Shop clicks": "نقرات المتجر",
  "All clicks": "كل النقرات",
  "Link CTR": "نسبة نقر الرابط",
  "Link CPC": "تكلفة نقرة الرابط",
  "All-click CTR": "نسبة كل النقرات",
  "All-click CPC": "تكلفة كل النقرات",
  "CPM": "تكلفة ألف ظهور",
  "Landing-page views": "مشاهدات صفحة الهبوط",
  "Cost / landing-page view": "تكلفة مشاهدة صفحة الهبوط",
  "Quality ranking": "ترتيب الجودة",
  "Engagement ranking": "ترتيب التفاعل",
  "Conversion ranking": "ترتيب التحويل",
  "Reporting starts": "بداية التقرير",
  "Reporting ends": "نهاية التقرير",
  "Account": "الحساب",
  "Account ID": "معرّف الحساب",
  "Campaign ID": "معرّف الحملة",
  "Ad set ID": "معرّف المجموعة الإعلانية",
  "Ad ID": "معرّف الإعلان",
  "Page ID": "معرّف الصفحة",
  "All dates": "كل التواريخ",
  "Start": "البداية",
  "No saved changes yet": "لا توجد تغييرات محفوظة بعد",
  "Saved": "تم الحفظ",
  "Unknown": "غير معروف",
  "Unknown storage": "تخزين غير معروف",
  "MySQL storage is active. Automatic snapshots are kept before every change.": "تخزين MySQL مفعّل. يتم حفظ نسخة أمان تلقائياً قبل كل تغيير.",
  "Local JSON is for development only. Configure MySQL before entering production data.": "تخزين JSON المحلي مخصص للتجارب فقط. قم بإعداد MySQL قبل إدخال بيانات حقيقية.",
  "Click one or more cards above after importing reports to build the trend graph.": "بعد استيراد التقارير، اضغط على بطاقة أو أكثر لبناء الرسم البياني.",
  "Overview trend graph": "رسم اتجاه النظرة العامة",
  "Lines are scaled 0-100 so different metrics can sit on one graph. For cost per registered, the line is reversed: higher means the cost is lower.": "كل الخطوط مقاسة من 0 إلى 100 حتى تظهر المقاييس المختلفة في رسم واحد. تكلفة التسجيل معكوسة: الصعود يعني أن التكلفة تنخفض.",
  "Start with your Meta Ads report": "ابدأ بتقرير Meta Ads",
  "Import the saved CSV once. Campaigns, ad sets, ads, spend, and messages will appear automatically.": "استورد ملف CSV المحفوظ مرة واحدة. ستظهر الحملات والمجموعات والإعلانات والصرف والرسائل تلقائياً.",
  "Import first report": "استيراد أول تقرير",
  "Import a Meta Ads report to see performance.": "استورد تقرير Meta Ads لرؤية الأداء.",
  "Add agents to compare their results.": "أضف المستشارين لمقارنة نتائجهم.",
  "No performance matches these filters.": "لا توجد نتائج أداء مطابقة لهذه الفلاتر.",
  "No outcomes recorded yet. Use “Add outcome” to begin.": "لا توجد نتائج مسجلة بعد. استعمل “إضافة نتيجة” للبدء.",
  "Not entered": "غير مدخل",
  "No phone": "لا يوجد هاتف",
  "Delete outcome": "حذف النتيجة",
  "Delete": "حذف",
  "No agents yet.": "لا يوجد مستشارون بعد.",
  "No WhatsApp number": "لا يوجد رقم واتساب",
  "matched ad sets": "مجموعات مطابقة",
  "registrations": "تسجيلات",
  "Add your first sales agent. Existing imported ad sets will be matched immediately.": "أضف أول مستشار تجاري. ستتم مطابقة المجموعات الإعلانية المستوردة فوراً.",
  "Unknown campaign": "حملة غير معروفة",
  "Multiple names found": "تم العثور على عدة أسماء",
  "No matching agent": "لا يوجد مستشار مطابق",
  "All imported ad sets are assigned.": "كل المجموعات الإعلانية المستوردة معيّنة.",
  "No days": "لا توجد أيام",
  "Nidam shift": "نظام الشيفت",
  "Calendrier hebdomadaire": "الجدول الأسبوعي",
  "Tous les jours visibles": "كل أيام الأسبوع ظاهرة",
  "Vert = libre. Orange = conflit léger. Rouge = chargé. Cliquez sur un jour pour voir les heures exactes.": "الأخضر يعني متاح. البرتقالي يعني تعارض خفيف. الأحمر يعني مزدحم. اضغط على اليوم لرؤية الساعات بالتفصيل.",
  "Vue semaine": "عرض الأسبوع",
  "Jour détaillé": "تفاصيل اليوم",
  "Cliquez sur une case verte pour créer le groupe directement. Cliquez sur un jour pour voir toutes les heures libres et occupées.": "اضغط على خانة خضراء لإنشاء الفوج مباشرة. اضغط على اليوم لرؤية كل الساعات المتاحة والمشغولة.",
  "Disponible": "متاح",
  "Conflit": "تعارض",
  "Chargé": "مزدحم",
  "Libre": "متاح",
  "Occupé": "مشغول",
  "Créneau libre": "وقت متاح",
  "Créer ici": "إنشاء هنا",
  "Voir la journée": "عرض اليوم",
  "Créer quand même": "إنشاء رغم ذلك",
  "Créer ce planning": "إنشاء هذه البرمجة",
  "Meilleur créneau": "أفضل وقت",
  "Aucun conflit": "لا يوجد تعارض",
  "Conflits détectés": "تم اكتشاف تعارضات",
  "Groupes déjà dans ce créneau": "أفواج موجودة في هذا الوقت",
  "Aucun groupe dans ce créneau.": "لا يوجد أي فوج في هذا الوقت.",
  "Heures exactes": "الساعات بالتفصيل",
  "Sélectionnez un jour": "اختر يوماً",
  "Lundi": "الإثنين",
  "Mardi": "الثلاثاء",
  "Mercredi": "الأربعاء",
  "Jeudi": "الخميس",
  "Vendredi": "الجمعة",
  "Samedi": "السبت",
  "Dimanche": "الأحد",
  "Monday": "الإثنين",
  "Tuesday": "الثلاثاء",
  "Wednesday": "الأربعاء",
  "Thursday": "الخميس",
  "Friday": "الجمعة",
  "Saturday": "السبت",
  "Sunday": "الأحد",
  "Créer une nouvelle formation": "إنشاء تكوين جديد",
  "Ajoutez une formation ou un groupe existant pour recevoir des propositions.": "أضف تكويناً أو فوجاً موجوداً للحصول على اقتراحات.",
  "Relancez les propositions avant de créer le groupe": "أعد تشغيل الاقتراحات قبل إنشاء الفوج",
  "Choisissez une formation ou tapez le nom de la nouvelle formation": "اختر تكويناً أو اكتب اسم التكوين الجديد",
  "Planning créé. Vérifiez le groupe puis ajoutez les étudiants.": "تم إنشاء البرمجة. راجع الفوج ثم أضف الطلبة.",
  "Payé": "مدفوع",
  "Aucun groupe pour le moment. Ajoutez une formation, puis créez le premier groupe planifié.": "لا يوجد أي فوج حالياً. أضف تكويناً، ثم أنشئ أول فوج مبرمج.",
  "Sans téléphone": "بدون هاتف",
  "Sans groupe": "بدون فوج",
  "Formation inconnue": "تكوين غير معروف",
  "Non assigné": "غير معيّن",
  "Aucun étudiant ne correspond à ces filtres.": "لا يوجد أي طالب مطابق لهذه الفلاتر.",
  "Aucun reste à payer dans cette vue.": "لا يوجد أي مبلغ متبقٍ في هذه الرؤية.",
  "Compte commercial non lié.": "حساب المستشار غير مربوط.",
  "Zone étudiants verrouillée.": "منطقة الطلبة مقفلة.",
  "Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir des noms, téléphones ou paiements.": "قم بإعداد CRM_USER و CRM_PASSWORD في Hostinger قبل إدخال الأسماء أو الهواتف أو الأداءات.",
  "Ce compte commercial n'est pas lié à un agent. Créez l'agent correspondant avec le compte admin.": "هذا الحساب التجاري غير مربوط بمستشار. أنشئ المستشار المطابق من حساب المدير.",
  "Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir les données étudiants.": "قم بإعداد CRM_USER و CRM_PASSWORD في Hostinger قبل إدخال بيانات الطلبة.",
  "Toutes les formations": "كل التكوينات",
  "Tous les horaires": "كل الأوقات",
  "Groupes": "الأفواج",
  "Places utilisées": "المقاعد المستعملة",
  "Places restantes": "المقاعد المتبقية",
  "Encaissé": "المبلغ المحصل",
  "groupes filtrés": "أفواج مفلترة",
  "places restantes": "مقاعد متبقية",
  "registre filtré": "سجل مفلتر",
  "paiements enregistrés": "أداءات مسجلة",
  "à relancer": "للمتابعة",
  "Pas de date début": "لا يوجد تاريخ بداية",
  "prix par défaut": "السعر الافتراضي",
  "étudiants": "طلبة",
  "payé": "مدفوع",
  "reste": "الباقي",
  "Voir étudiants": "عرض الطلبة",
  "Inscrire": "تسجيل",
  "Ajouter paiement pour": "إضافة أداء لـ",
  "Modifier": "تعديل",
  "Manual result": "نتيجة يدوية",
  "Add an outcome": "إضافة نتيجة",
  "Choose what happened and where it came from.": "اختر ما حدث ومن أين جاء.",
  "What happened?": "ماذا حدث؟",
  "Plans to visit": "ينوي زيارة المركز",
  "Visited, did not register": "زار ولم يسجل",
  "Also counts as a visit": "يُحسب أيضاً كزيارة",
  "Person name": "اسم الشخص",
  "Student name": "اسم الطالب",
  "Phone": "الهاتف",
  "Date": "التاريخ",
  "Assign this outcome": "تعيين هذه النتيجة",
  "Use the most specific source you know.": "استعمل أدق مصدر تعرفه.",
  "Level": "المستوى",
  "Ad set": "المجموعة الإعلانية",
  "Note": "ملاحظة",
  "Anything useful to remember": "أي معلومة مفيدة للتذكر",
  "Save outcome": "حفظ النتيجة",
  "Close outcome form": "إغلاق نموذج النتيجة",
  "Choose campaign": "اختر الحملة",
  "No campaign available": "لا توجد حملة متاحة",
  "No objective": "لا يوجد هدف",
  "Choose ad set": "اختر المجموعة الإعلانية",
  "No ad sets in this campaign": "لا توجد مجموعات إعلانية في هذه الحملة",
  "Choose campaign first": "اختر الحملة أولاً",
  "Choose exact ad": "اختر الإعلان بالضبط",
  "No ads in this ad set": "لا توجد إعلانات في هذه المجموعة",
  "Choose ad set first": "اختر المجموعة الإعلانية أولاً",
  "no code": "بدون كود",
  "Choose campaign, then ad set, then exact ad so duplicate ad names stay separate.": "اختر الحملة، ثم المجموعة الإعلانية، ثم الإعلان بالضبط حتى تبقى الإعلانات ذات الاسم نفسه منفصلة.",
  "Choose campaign first, then the ad set that produced the outcome.": "اختر الحملة أولاً، ثم المجموعة الإعلانية التي أنتجت النتيجة.",
  "Choose the campaign that produced the outcome.": "اختر الحملة التي أنتجت النتيجة.",
  "Use when you only know the sales agent.": "استعمل هذا عندما تعرف المستشار التجاري فقط.",
  "Clean start": "بداية نظيفة",
  "Reset all CRM data?": "هل تريد تصفير كل بيانات النظام؟",
  "This clears accounts, campaigns, ad sets, ads, imports, ad spend logs, outcomes, leads, trainings, groups, students, payments, and used creative codes. Download a backup first if you might need the old data.": "هذا سيحذف الحسابات والحملات والمجموعات الإعلانية والإعلانات والاستيرادات وسجلات الصرف والنتائج والعملاء المحتملين والتكوينات والأفواج والطلبة والأداءات وأكواد الإبداع المستعملة. حمّل نسخة احتياطية أولاً إذا كنت قد تحتاج البيانات القديمة.",
  "Reset data": "تصفير البيانات",
  "Confirm recovery": "تأكيد الاسترجاع",
  "Replace current CRM data?": "هل تريد استبدال بيانات النظام الحالية؟",
  "The selected backup will replace the current records. A safety backup is created first.": "النسخة المختارة ستستبدل السجلات الحالية. سيتم إنشاء نسخة أمان أولاً.",
  "Restore backup": "استرجاع النسخة",
  "Edit agent": "تعديل المستشار",
  "Renaming an agent rematches imported ad sets by name, ignoring uppercase/lowercase.": "تغيير اسم المستشار يعيد مطابقة المجموعات الإعلانية المستوردة حسب الاسم دون حساسية لحجم الحروف.",
  "Close agent form": "إغلاق نموذج المستشار",
  "WhatsApp": "واتساب",
  "If this exact name appears in campaign, ad set, or ad names, those rows will be assigned to the agent automatically.": "إذا ظهر هذا الاسم بالضبط في اسم الحملة أو المجموعة الإعلانية أو الإعلان، سيتم تعيين تلك الصفوف للمستشار تلقائياً.",
  "Save agent": "حفظ المستشار",
  "Ajouter formation": "إضافة تكوين",
  "Modifier formation": "تعديل التكوين",
  "Nom du cours, durée, prix normal et prix remisé.": "اسم الدرس، المدة، السعر العادي، والسعر المخفض.",
  "Nom, durée, rythme des séances et les prix.": "الاسم، المدة، وتيرة الحصص، والأسعار.",
  "Unité": "الوحدة",
  "Mois": "أشهر",
  "Années": "سنوات",
  "Séances par semaine": "حصص في الأسبوع",
  "Durée d'une séance (heures)": "مدة الحصة (ساعات)",
  "Prix · الأسعار": "الأسعار",
  "Les trois prix de la formation": "الأسعار الثلاثة للتكوين",
  "Le prix mensuel est le prix principal. Le cash est le prix remisé payé en une fois.": "السعر الشهري هو السعر الأساسي. النقدي هو السعر المخفض المؤدى مرة واحدة.",
  "Prix mensuel": "السعر الشهري",
  "principal": "أساسي",
  "Prix total (une fois)": "الثمن الإجمالي (مرة واحدة)",
  "Prix cash / remisé": "السعر النقدي / المخفض",
  "Nidam shift (matin + soir)": "نظام شيفت (صباح + مساء)",
  "La même séance est offerte le matin et le soir, l'étudiant vient quand il veut.": "نفس الحصة تُقدَّم صباحاً ومساءً، والطالب يحضر متى شاء.",
  "Disponibilité prof": "توفر الأستاذ",
  "Séances du groupe": "حصص الفوج",
  "Groupe à planifier": "الفوج المراد برمجته",
  "Distribuer automatiquement": "توزيع تلقائي",
  "Un groupe est juste un nom sous une formation. Les horaires se planifient ensuite sur le calendrier.": "الفوج مجرد اسم داخل تكوين. تُبرمَج المواعيد بعد ذلك على الرزنامة.",
  "Nom du groupe": "اسم الفوج",
  "Groupe 1, Groupe 2, Groupe soir…": "فوج 1، فوج 2، فوج مسائي…",
  "Après avoir créé le groupe": "بعد إنشاء الفوج",
  "Ajouter": "إضافة",
  "Séance du groupe": "حصة الفوج",
  "Retirer": "إزالة",
  "Séance ✓": "حصة ✓",
  "Autre groupe": "فوج آخر",
  "Prof non dispo": "الأستاذ غير متوفر",
  "Séance ajoutée": "تمت إضافة الحصة",
  "Séance retirée": "تمت إزالة الحصة",
  "Séances distribuées. Vérifiez et ajustez si besoin.": "تم توزيع الحصص. تحقق وعدّل عند الحاجة.",
  "Aucune séance planifiée": "لا توجد حصص مبرمجة",
  "Créez d'abord un groupe, puis planifiez ses séances ici.": "أنشئ فوجاً أولاً، ثم برمج حصصه هنا.",
  "Planifier": "التخطيط",
  "Mode disponibilité.": "وضع التوفر.",
  "Cliquez une case pour indiquer si le professeur est disponible ou non à cette heure. Vert = disponible, gris = non disponible. Les créneaux non disponibles sont bloqués pour les groupes.": "انقر على خانة لتحديد ما إذا كان الأستاذ متوفراً أو لا في هذا الوقت. أخضر = متوفر، رمادي = غير متوفر. الأوقات غير المتوفرة محجوبة عن الأفواج.",
  "Disponibilité du professeur": "توفر الأستاذ",
  "Cliquez pour activer / désactiver": "انقر للتفعيل / الإلغاء",
  "Vert = disponible. Gris = non disponible. Ces créneaux bloqués sont exclus du planning des groupes.": "أخضر = متوفر. رمادي = غير متوفر. هذه الأوقات المحجوبة مستثناة من تخطيط الأفواج.",
  "Disponible": "متوفر",
  "Non disponible": "غير متوفر",
  "Prof non disponible": "الأستاذ غير متوفر",
  "Bloqué": "محجوب",
  "Heures": "الساعات",
  "Professeur marqué disponible": "تم تعيين الأستاذ كمتوفر",
  "Professeur marqué non disponible": "تم تعيين الأستاذ كغير متوفر",
  "Reste": "الباقي",
  "+ Ajouter paiement": "+ إضافة أداء",
  "Modifier détails": "تعديل التفاصيل",
  "Transférer vers un groupe": "النقل إلى فوج",
  "Changer le statut": "تغيير الحالة",
  "Même formation": "نفس التكوين",
  "Autres formations": "تكوينات أخرى",
  "Inscrit le": "مسجل بتاريخ",
  "Étudiant transféré": "تم نقل الطالب",
  "Statut mis à jour": "تم تحديث الحالة",
  "Rapports": "التقارير",
  "Rapport agent · تقرير المستشار": "تقرير المستشار",
  "Rapports détaillés par agent": "تقارير مفصلة حسب المستشار",
  "Choisissez un agent pour voir ses résultats publicité, son ROI, sa qualité de closing, ses étudiants et paiements.": "اختر مستشاراً لرؤية نتائج الإعلانات، العائد، جودة الإغلاق، الطلبة والأداءات.",
  "Imprimer / PDF": "طباعة / PDF",
  "Le rapport respecte la période choisie en haut. Modifiez la période pour comparer des semaines ou des mois.": "يعتمد التقرير على الفترة المختارة أعلاه. غيّر الفترة لمقارنة الأسابيع أو الأشهر.",
  "Choisir un agent…": "اختر مستشاراً…",
  "Ajoutez un agent, puis choisissez-le pour voir son rapport détaillé.": "أضف مستشاراً ثم اختره لرؤية تقريره المفصل.",
  "Publicité & ROI": "الإعلانات والعائد",
  "Qualité de closing": "جودة الإغلاق",
  "Taux de présence": "نسبة الحضور",
  "des rendez-vous venus": "من المواعيد التي حضرت",
  "Taux de conversion": "نسبة التحويل",
  "visites → inscriptions": "الزيارات ← التسجيلات",
  "Score closing": "نقطة الإغلاق",
  "Rendez-vous": "المواعيد",
  "Visites": "الزيارات",
  "sur la période": "خلال الفترة",
  "des étudiants de l'agent": "من طلبة المستشار",
  "si tout payé · ": "إذا أدى الجميع · ",
  "Sans WhatsApp": "بدون واتساب",
  "Supprimer l'étudiant": "حذف الطالب",
  "Étudiant supprimé": "تم حذف الطالب",
  "Objectif & progression": "الهدف والتقدم",
  "Suivi de l'objectif": "متابعة الهدف",
  "Valeurs exactes. Choisissez une métrique dans les cartes, ou fixez un objectif pour voir le rythme.": "قيم دقيقة. اختر مقياساً من البطاقات، أو حدد هدفاً لرؤية الإيقاع.",
  "+ Objectif": "+ هدف",
  "Nouvel objectif": "هدف جديد",
  "Modifier l'objectif": "تعديل الهدف",
  "Fixez une cible et une période. Le suivi montre si vous êtes en avance ou en retard.": "حدد هدفاً وفترة. تُظهر المتابعة إن كنت متقدماً أو متأخراً.",
  "Titre": "العنوان",
  "Ex: 50 inscrits en septembre": "مثلاً: 50 مسجلاً في شتنبر",
  "Type d'objectif": "نوع الهدف",
  "Étudiants inscrits": "الطلبة المسجلون",
  "Revenu encaissé": "المداخيل المحصّلة",
  "Coût par inscrit (max)": "الكلفة لكل مسجل (الأقصى)",
  "Métrique personnalisée": "مقياس مخصص",
  "Métrique": "المقياس",
  "Inscrits": "المسجلون",
  "Visites": "الزيارات",
  "Rendez-vous": "المواعيد",
  "Dépense": "الإنفاق",
  "Cible (nombre)": "الهدف (عدد)",
  "Cible (montant)": "الهدف (مبلغ)",
  "Coût max par inscrit": "الكلفة القصوى لكل مسجل",
  "Enregistrer l'objectif": "حفظ الهدف",
  "Objectif enregistré": "تم حفظ الهدف",
  "Objectif supprimé": "تم حذف الهدف",
  "Aucun objectif. Cliquez « + Objectif » pour en fixer un (inscrits, revenu, coût par inscrit…).": "لا يوجد هدف. انقر «+ هدف» لتحديد واحد (المسجلون، المداخيل، الكلفة لكل مسجل…).",
  "Coût par inscrit": "الكلفة لكل مسجل",
  "Objectif atteint": "تم بلوغ الهدف",
  "Objectif tenu": "الهدف محقق",
  "Au-dessus de l'objectif": "أعلى من الهدف",
  "Dans les temps": "ضمن الوقت",
  "Valeurs exactes. La ligne pointillée = rythme idéal pour atteindre l'objectif à la date prévue.": "قيم دقيقة. الخط المنقّط = الإيقاع المثالي لبلوغ الهدف في التاريخ المحدد.",
  "Valeurs exactes. Choisissez une métrique ci-dessus, ou définissez un objectif pour suivre le rythme.": "قيم دقيقة. اختر مقياساً أعلاه، أو حدد هدفاً لمتابعة الإيقاع.",
  "Importez des rapports ou définissez un objectif pour voir la courbe.": "استورد التقارير أو حدد هدفاً لرؤية المنحنى.",
  "Budget manuel · ميزانية يدوية": "ميزانية يدوية",
  "Ajoutez un budget sans CSV et répartissez-le où vous voulez, sur la période choisie.": "أضف ميزانية دون CSV ووزّعها حيثما شئت على الفترة المختارة.",
  "Montant total": "المبلغ الإجمالي",
  "Niveau": "المستوى",
  "Centre (global)": "المركز (شامل)",
  "Agent": "المستشار",
  "Campagne": "الحملة",
  "Ad set": "المجموعة الإعلانية",
  "Cible": "الهدف",
  "Période": "الفترة",
  "Aujourd'hui": "اليوم",
  "2 derniers jours": "آخر يومين",
  "7 derniers jours": "آخر 7 أيام",
  "Personnalisé": "مخصص",
  "Du": "من",
  "Au": "إلى",
  "Étiquette": "التسمية",
  "Ex: nouveau compte pub": "مثلاً: حساب إعلاني جديد",
  "Le montant est réparti également sur chaque jour de la période. Les budgets manuels ne sont pas écrasés par les imports CSV.": "يُوزَّع المبلغ بالتساوي على كل يوم من الفترة. الميزانيات اليدوية لا تُمحى عند استيراد CSV.",
  "Ajouter le budget": "إضافة الميزانية",
  "Aucun budget manuel. Ajoutez-en un ci-dessus.": "لا توجد ميزانية يدوية. أضف واحدة أعلاه.",
  "Choisir…": "اختر…",
  "Budget ajouté": "تمت إضافة الميزانية",
  "Budget supprimé": "تم حذف الميزانية",
  "Encaissé (élèves)": "المحصّل (الطلبة)",
  "ROI (encaissé)": "العائد (المحصّل)",
  "Potentiel (si tout payé)": "المحتمل (إذا أدى الجميع)",
  "ROI potentiel": "العائد المحتمل",
  "Gestion des étudiants · تدبير الطلبة": "تدبير الطلبة",
  "Filtrez par formation, groupe, statut ou paiement. Cliquez un étudiant pour tout gérer.": "صفِّ حسب التكوين، الفوج، الحالة أو الأداء. انقر على طالب لتدبير كل شيء.",
  "Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir des données étudiant.": "اضبط CRM_USER و CRM_PASSWORD على Hostinger قبل إدخال بيانات الطلبة.",
  "Filtrer par formation": "التصفية حسب التكوين",
  "Cliquez une carte pour ne voir que ses étudiants.": "انقر على بطاقة لعرض طلبتها فقط.",
  "Tous les groupes": "كل الأفواج",
  "Tous les statuts": "كل الحالات",
  "Payé totalement": "مؤدى بالكامل",
  "En retard": "متأخر",
  "Bientôt dû": "قريب الاستحقاق",
  "dans ce filtre": "ضمن هذه التصفية",
  "total payé": "مجموع المؤدى",
  "solde ouvert": "رصيد مفتوح",
  "paiements dépassés": "أداءات متجاوزة",
  "Encaissé": "المحصّل",
  "Aucun étudiant ne correspond à ces filtres.": "لا يوجد طالب يطابق هذه التصفية.",
  "Formation choisie": "التكوين المختار",
  "Toutes les formations": "كل التكوينات",
  "Places disponibles": "الأماكن المتوفرة",
  "Vert = places libres. Cliquez une séance pour l'assigner.": "أخضر = أماكن متوفرة. انقر على حصة لإسنادها.",
  "Choisissez une formation pour voir les séances disponibles.": "اختر تكويناً لعرض الحصص المتوفرة.",
  "Aucune séance pour cette formation. Créez un groupe dans l'assistant planning.": "لا توجد حصص لهذا التكوين. أنشئ فوجاً من مساعد التخطيط.",
  "Complet": "ممتلئ",
  "Groupe (séance principale)": "الفوج (الحصة الأساسية)",
  "L'étudiant peut assister à n'importe quelle séance de la même formation, même dans un autre groupe.": "يمكن للطالب حضور أي حصة من نفس التكوين، حتى في فوج آخر.",
  "Choisissez une séance disponible ci-dessus, ou sélectionnez ici. L'étudiant peut assister à n'importe quelle séance de la même formation, même dans un autre groupe.": "اختر حصة متوفرة أعلاه، أو حدّدها هنا. يمكن للطالب حضور أي حصة من نفس التكوين، حتى في فوج آخر.",
  "COMPLET": "ممتلئ",
  "Fermer": "إغلاق",
  "Nom formation": "اسم التكوين",
  "Comptabilité 3 mois": "محاسبة 3 أشهر",
  "3 mois, 5 mois, année complète": "3 أشهر، 5 أشهر، سنة كاملة",
  "Prix normal": "السعر العادي",
  "Prix remisé": "السعر المخفض",
  "Notes": "ملاحظات",
  "Ce que la formation inclut": "ما يشمله التكوين",
  "Annuler": "إلغاء",
  "Enregistrer formation": "حفظ التكوين",
  "Ajouter groupe": "إضافة فوج",
  "Créez un créneau avec capacité, prix, et option nidam shift.": "أنشئ وقتاً بطاقة استيعابية وسعر مع خيار نظام الشيفت.",
  "Nom groupe": "اسم الفوج",
  "Groupe soir A": "فوج المساء A",
  "Jours": "الأيام",
  "Monday, Wednesday": "الإثنين، الأربعاء",
  "Début": "البداية",
  "Fin": "النهاية",
  "Mode présence": "نظام الحضور",
  "Jours shift alternatif": "أيام الشيفت البديل",
  "Début shift alternatif": "بداية الشيفت البديل",
  "Fin shift alternatif": "نهاية الشيفت البديل",
  "Capacité": "الطاقة الاستيعابية",
  "Prix groupe": "سعر الفوج",
  "Prix formation": "سعر التكوين",
  "Optionnel": "اختياري",
  "optionnel": "اختياري",
  "Date début": "تاريخ البداية",
  "Date fin": "تاريخ النهاية",
  "Statut": "الحالة",
  "Actif": "نشط",
  "Pause": "متوقف مؤقتاً",
  "Terminé": "منتهي",
  "Salle, formateur, timing spécial": "القاعة، الأستاذ، توقيت خاص",
  "Enregistrer groupe": "حفظ الفوج",
  "Inscription étudiant": "تسجيل طالب",
  "Inscrire étudiant": "تسجيل طالب",
  "Modifier étudiant": "تعديل الطالب",
  "Assignez l'étudiant au groupe et enregistrez le prix convenu.": "عيّن الطالب في الفوج وسجّل السعر المتفق عليه.",
  "Assignez l'étudiant au groupe et enregistrez l'accord de paiement exact.": "عيّن الطالب في الفوج وسجّل اتفاق الأداء بدقة.",
  "Nom étudiant": "اسم الطالب",
  "Nom complet": "الاسم الكامل",
  "Téléphone": "الهاتف",
  "Agent commercial": "المستشار التجاري",
  "Date inscription": "تاريخ التسجيل",
  "Accord paiement": "اتفاق الأداء",
  "Comment l'étudiant va payer": "طريقة أداء الطالب",
  "Choisissez cash, mensuel, ou un accord spécial.": "اختر الأداء نقداً، شهرياً، أو اتفاقاً خاصاً.",
  "Use this when the student pays the whole course price now, usually the cash discount.": "استعمل هذا الخيار عندما يؤدي الطالب ثمن التكوين كاملاً الآن، غالباً بالسعر النقدي المخفض.",
  "Use this when the student pays a higher total split month by month.": "استعمل هذا الخيار عندما يكون الثمن الإجمالي أعلى ومقسماً على دفعات شهرية.",
  "Use this for exceptions: choose the total deal, what they paid now, and the exact next follow-up date.": "استعمل هذا الخيار للحالات الخاصة: حدّد الثمن المتفق عليه، ما دفعه الآن، وتاريخ المتابعة القادم بدقة.",
  "Mode paiement": "طريقة الأداء",
  "Paiement total": "أداء كامل",
  "Paiement par tranches": "أداء بالتقسيط",
  "Payé full / Cash": "أداء كامل / نقداً",
  "Prix cash quand il paie tout le cours.": "السعر النقدي عندما يؤدي التكوين كاملاً.",
  "Paiement mensuel": "أداء شهري",
  "Total plus élevé, payé chaque mois.": "ثمن إجمالي أعلى يُؤدى كل شهر.",
  "Accord spécial": "اتفاق خاص",
  "Ex: 1500 maintenant, reste le mois prochain.": "مثلاً: 1500 الآن والباقي الشهر القادم.",
  "Prix final": "السعر النهائي",
  "Prix convenu total": "الثمن الإجمالي المتفق عليه",
  "Payé maintenant": "المدفوع الآن",
  "Date départ paiement": "تاريخ بداية الأداء",
  "Montant chaque mois": "مبلغ كل شهر",
  "Nombre de mois": "عدد الأشهر",
  "Prochain paiement": "الأداء القادم",
  "Ex: total 3000, il paie 1500 maintenant et 1500 le mois prochain": "مثلاً: المجموع 3000، أدى 1500 الآن و1500 الشهر القادم",
  "Inscrit": "مسجل",
  "Annulé": "ملغى",
  "Accord paiement, documents, remarques": "اتفاق الأداء، الوثائق، الملاحظات",
  "Notes étudiant": "ملاحظات الطالب",
  "Documents, remarques, besoin particulier": "الوثائق، الملاحظات، أو أي احتياج خاص",
  "Enregistrer étudiant": "حفظ الطالب",
  "Paiement · أداء": "الأداء",
  "Ajouter paiement": "إضافة أداء",
  "Enregistrer un paiement étudiant.": "تسجيل أداء للطالب.",
  "Montant": "المبلغ",
  "Date paiement": "تاريخ الأداء",
  "Méthode": "الطريقة",
  "Espèces": "نقداً",
  "Virement": "تحويل بنكي",
  "Carte": "بطاقة",
  "Autre": "أخرى",
  "Prochain paiement optionnel": "الأداء القادم اختياري",
  "Reçu, tranche, rappel": "وصل، قسط، تذكير",
  "Enregistrer paiement": "حفظ الأداء",
  "Historique étudiant": "تتبع الطالب",
  "Inscription, modifications et paiements dans une seule trace.": "التسجيل، التعديلات، والأداءات في سجل واحد.",
  "Historique paiements": "تاريخ الأداءات",
  "Trace complète": "السجل الكامل",
  "Inconnue": "غير معروف",
  "Aucun paiement enregistré.": "لا يوجد أي أداء مسجل.",
  "Ancien dossier étudiant": "ملف طالب قديم",
  "Aucun événement enregistré.": "لا يوجد أي حدث مسجل.",
  "Paid full / cash": "أداء كامل / نقداً",
  "Monthly payments": "أداء شهري",
  "Custom agreement": "اتفاق خاص",
  "Paid full": "مؤدى بالكامل",
  "No remaining balance": "لا يوجد مبلغ متبقٍ",
  "Overdue payment": "أداء متأخر",
  "Due today": "مستحق اليوم",
  "Collect today": "يجب التحصيل اليوم",
  "Due soon": "قريب الاستحقاق",
  "Next payment scheduled": "الأداء القادم مبرمج",
  "Flexible balance": "باقي باتفاق مرن",
  "No next date set": "لم يتم تحديد التاريخ القادم",
  "No payment yet": "لم يتم الأداء بعد",
  "Collect first payment": "حصّل الدفعة الأولى",
  "Choose the CSV version of your Meta report": "اختر نسخة CSV من تقرير Meta",
  "The CSV is larger than 9 MB": "ملف CSV أكبر من 9 MB",
  "ready to import": "جاهز للاستيراد",
  "Saving…": "جاري الحفظ…",
  "Outcome saved": "تم حفظ النتيجة",
  "Training saved": "تم حفظ التكوين",
  "Group saved": "تم حفظ الفوج",
  "Student saved": "تم حفظ الطالب",
  "Payment saved": "تم حفظ الأداء",
  "Agent updated and ad sets rematched": "تم تحديث المستشار وإعادة مطابقة المجموعات الإعلانية",
  "Agent added and ad sets rematched": "تمت إضافة المستشار وإعادة مطابقة المجموعات الإعلانية",
  "Choose where this outcome came from": "اختر مصدر هذه النتيجة",
  "Choose a student first": "اختر الطالب أولاً",
  "Agent not found": "المستشار غير موجود",
  "Ajoutez une formation avant de créer un groupe": "أضف تكويناً قبل إنشاء فوج",
  "Ajoutez un groupe avant d'inscrire des étudiants": "أضف فوجاً قبل تسجيل الطلبة",
  "Étudiant introuvable": "الطالب غير موجود",
  "Chargement...": "جاري التحميل...",
  "Création...": "جاري الإنشاء...",
  "Agent deleted and ad sets rematched": "تم حذف المستشار وإعادة مطابقة المجموعات الإعلانية",
  "Outcome deleted": "تم حذف النتيجة",
  "Data refreshed": "تم تحديث البيانات",
  "Synchronizing…": "جاري المزامنة…",
  "Backup file is larger than 10 MB": "ملف النسخة الاحتياطية أكبر من 10 MB",
  "Restoring…": "جاري الاسترجاع…",
  "Backup restored successfully": "تم استرجاع النسخة الاحتياطية بنجاح",
  "Resetting...": "جاري التصفير...",
  "CRM data reset. Import your first real report.": "تم تصفير بيانات النظام. استورد أول تقرير حقيقي.",
  "Request failed": "فشل الطلب",
  "This group is already full": "هذا الفوج ممتلئ",
  "Choose a valid group": "اختر فوجاً صحيحاً",
  "Choose a valid sales agent": "اختر مستشاراً صحيحاً",
  "This student belongs to another sales agent.": "هذا الطالب تابع لمستشار آخر.",
  "This login can only access student operations.": "هذا الدخول مخصص لعمليات الطلبة فقط.",
  "Strong": "قوي",
  "Watch": "راقب",
  "Weak": "ضعيف",
  "Awaiting": "في الانتظار",
  "Learning": "يتعلم",
  "Not enough": "غير كافٍ",
  "No data": "لا توجد بيانات",
  "No spend": "لا يوجد صرف",
  "Low confidence": "ثقة منخفضة",
  "Medium confidence": "ثقة متوسطة",
  "High confidence": "ثقة عالية",
  "Quality score — highest": "نقطة الجودة — الأعلى",
  "Spend — highest": "الصرف — الأعلى",
  "Spend — lowest": "الصرف — الأقل",
  "Booked appointments — most": "المواعيد المحجوزة — الأكثر",
  "Showed, no registration — most": "زار ولم يسجل — الأكثر",
  "Registered students — most": "الطلبة المسجلون — الأكثر",
  "Cost / booked — lowest": "تكلفة الموعد — الأقل",
  "Cost / showed — lowest": "تكلفة الزيارة بدون تسجيل — الأقل",
  "Cost / registered — lowest": "تكلفة التسجيل — الأقل",
  "Messages — most": "الرسائل — الأكثر",
  "Business quality - highest": "جودة العمل - الأعلى",
  "Agent closing - highest": "إغلاق المستشار - الأعلى",
  "Spend - highest": "الصرف - الأعلى",
  "Spend - lowest": "الصرف - الأقل",
  "Booked appointments - most": "المواعيد المحجوزة - الأكثر",
  "Total visits - most": "إجمالي الزيارات - الأكثر",
  "Showed, no registration - most": "زار ولم يسجل - الأكثر",
  "Registered students - most": "الطلبة المسجلون - الأكثر",
  "Cost / booked - lowest": "تكلفة الموعد - الأقل",
  "Cost / visit - lowest": "تكلفة الزيارة - الأقل",
  "Cost / registered - lowest": "تكلفة التسجيل - الأقل",
  "Show rate - highest": "نسبة الحضور - الأعلى",
  "Close rate - highest": "نسبة التسجيل - الأعلى",
  "Messages - most": "الرسائل - الأكثر",
  "Français / English": "الفرنسية / الإنجليزية",
  "CRM sections": "أقسام النظام",
  "Secure direct link": "رابط آمن مباشر",
  "Search outcomes": "بحث في النتائج",
  "Filter outcomes by type": "فلترة النتائج حسب النوع",
  "All outcomes": "كل النتائج",
  "Outcome": "النتيجة",
  "Person": "الشخص",
  "Assigned to": "مُعيّن إلى",
  "Actions": "الإجراءات",
  "Your latest successful synchronizations.": "آخر المزامنات الناجحة.",
  "Imported": "تاريخ الاستيراد",
  "File": "الملف",
  "Report rows": "صفوف التقرير",
  "New campaigns": "حملات جديدة",
  "New ad sets": "مجموعات جديدة",
  "New ads": "إعلانات جديدة",
  "Updated rows": "صفوف محدثة",
  "Protect the complete CRM, including hidden Meta fields.": "احمِ النظام كاملاً، بما في ذلك حقول Meta المخفية.",
  "Verifying the active storage backend.": "جاري التحقق من نظام التخزين النشط.",
  "Save a private JSON copy before major changes.": "احفظ نسخة JSON خاصة قبل التغييرات الكبيرة.",
  "This replaces current CRM records after confirmation.": "هذا يستبدل سجلات النظام الحالية بعد التأكيد.",
  "Choose JSON backup": "اختيار نسخة JSON احتياطية",
  "Clear old imports, spend, ads, outcomes, leads, and used creative codes before starting with real data.": "امسح الاستيرادات والصرف والإعلانات والنتائج والعملاء المحتملين وأكواد الإبداع القديمة قبل البدء ببيانات حقيقية.",
  // Ads Manager (Overview)
  "Ads Manager": "مدير الإعلانات",
  "Open a campaign to see its ad sets, then open an ad set to see its ads. Press + on any row to record a result at that level.": "افتح حملة لرؤية مجموعاتها الإعلانية، ثم افتح مجموعة لرؤية إعلاناتها. اضغط + على أي سطر لتسجيل نتيجة في ذلك المستوى.",
  "Ad": "الإعلان",
  "Delivery": "حالة العرض",
  "Amount spent": "المبلغ المصروف",
  "Unassigned": "غير معين",
  "Search by name or code": "ابحث بالاسم أو الرمز",
  "Report period": "فترة التقرير",
  "Same as report period": "نفس فترة التقرير",
  "Today and yesterday": "اليوم وأمس",
  "Last 14 days": "آخر 14 يوماً",
  "Last 28 days": "آخر 28 يوماً",
  "Last 30 days": "آخر 30 يوماً",
  "Last week": "الأسبوع الماضي",
  "Last month": "الشهر الماضي",
  "Maximum": "الحد الأقصى",
  "Date range": "نطاق التاريخ",
  "Date presets": "فترات جاهزة",
  "Start date": "تاريخ البدء",
  "End date": "تاريخ الانتهاء",
  "Previous month": "الشهر السابق",
  "Next month": "الشهر التالي",
  "Only this table changes. The report period at the top stays as it is.": "يتغير هذا الجدول فقط. فترة التقرير في الأعلى تبقى كما هي.",
  "Update": "تحديث",
  "Show Maximum": "عرض الحد الأقصى",
  "Total spent": "إجمالي الصرف",
  "Total": "الإجمالي",
  "Per registration": "لكل تسجيل",
  "Show ad sets": "عرض المجموعات الإعلانية",
  "Hide ad sets": "إخفاء المجموعات الإعلانية",
  "Show ads": "عرض الإعلانات",
  "Hide ads": "إخفاء الإعلانات",
  "Active": "نشط",
  "Inactive": "غير نشط",
  "Off": "متوقف",
  "Completed": "مكتمل",
  "Not delivering": "لا يتم العرض",
  "No campaigns had activity in this period.": "لا توجد حملات بنشاط في هذه الفترة.",
  "No ad sets had activity in this period.": "لا توجد مجموعات إعلانية بنشاط في هذه الفترة.",
  "No ads had activity in this period.": "لا توجد إعلانات بنشاط في هذه الفترة.",
  "No campaigns match this search.": "لا توجد حملات مطابقة لهذا البحث.",
  "No ad sets match this search.": "لا توجد مجموعات إعلانية مطابقة لهذا البحث.",
  "No ads match this search.": "لا توجد إعلانات مطابقة لهذا البحث.",
  "Import a Meta Ads report to see campaigns, ad sets, and ads.": "استورد تقرير Meta Ads لرؤية الحملات والمجموعات والإعلانات.",
  "Record results": "تسجيل النتائج",
  "Analyze": "التحليل",
  "Verdict": "الحكم",
  "Margin vs break-even": "الهامش مقابل نقطة التعادل",
  "Cost / RDV": "تكلفة الموعد",
  "RDV": "المواعيد",
  "Cost / message": "تكلفة الرسالة",
  "Trend · 6 weeks": "الاتجاه · 6 أسابيع",
  "Per RDV": "لكل موعد",
  "Per message": "لكل رسالة",
  "Total margin": "إجمالي الهامش",
  "Very profitable": "مربح جداً",
  "Profitable": "مربح",
  "Slightly profitable": "مربح قليلاً",
  "Break-even": "نقطة التعادل",
  "Slight loss": "خسارة طفيفة",
  "Losing": "خاسر",
  "Heavy loss": "خسارة كبيرة",
  "Not spending": "لا يصرف",
  "Scale budget": "زد الميزانية",
  "Scale gradually": "زد تدريجياً",
  "Keep running": "استمر",
  "Optimize": "حسّن",
  "Let it spend": "اتركه يصرف",
  "Fix creative / follow-up": "أصلح الإعلان / المتابعة",
  "Cut budget": "قلّص الميزانية",
  "Stop": "أوقف",
  "No registration": "بدون تسجيل",
  "At break-even": "عند نقطة التعادل",
  "low data": "بيانات قليلة",
  "Where the money goes": "أين يذهب المال",
  "profitable": "مربح",
  "break-even": "تعادل",
  "losing": "خاسر",
  "learning": "قيد التعلم",
  "Show all": "عرض الكل",
  "per registration": "لكل تسجيل",
  "Edit": "تعديل",
  "Break-even cost per registration": "تكلفة التعادل لكل تسجيل",
  "Same limit for leading metrics:": "نفس الحد للمؤشرات المبكرة:",
  "per RDV": "لكل موعد",
  "per message": "لكل رسالة",
  "From your real conversion:": "حسب تحويلك الفعلي:",
  "of RDVs register": "من المواعيد تسجل",
  "of messages register": "من الرسائل تسجل",
  "Record RDVs and registrations to derive break-even costs per RDV and per message.": "سجّل المواعيد والتسجيلات لحساب تكلفة التعادل لكل موعد ولكل رسالة.",
  "Spend by verdict": "الصرف حسب الحكم",
  "View charts": "عرض الرسوم",
  "Stable": "مستقر",
  "14 days": "14 يوماً",
  "30 days": "30 يوماً",
  "90 days": "90 يوماً",
  "Window": "المدة",
  "Metric": "المؤشر",
  "Parents": "المستويات الأعلى",
  "Per day": "في اليوم",
  "7-day average": "متوسط 7 أيام",
  "Break-even saved": "تم حفظ نقطة التعادل",
  "Not enough data": "بيانات غير كافية",
  "improving": "يتحسن",
  "getting worse": "يسوء",
  "stable": "مستقر",
  "Collapse menu": "طي القائمة",
  "No data in this window": "لا بيانات في هذه المدة",
  "reg.": "تسجيل",
  "Started converting": "بدأ يحقق تسجيلات",
  "No result lately": "لا نتائج مؤخراً",
  "last 7 days vs the 7 before:": "آخر 7 أيام مقابل 7 قبلها:",
  "2nd half vs 1st half of the window:": "النصف الثاني مقابل الأول من المدة:",
  "0 RDV": "0 موعد",
  "0 messages": "0 رسالة",
  "registrations per day": "تسجيلات في اليوم",
  "RDV per day": "مواعيد في اليوم",
  "messages per day": "رسائل في اليوم",
  "7-day rolling cost / registration": "تكلفة التسجيل (متوسط 7 أيام)",
  "7-day rolling cost / rdv": "تكلفة الموعد (متوسط 7 أيام)",
  "7-day rolling cost / message": "تكلفة الرسالة (متوسط 7 أيام)",
  "Manage agents": "إدارة المستشارين",
  "Other spellings": "كتابات أخرى",
  "comma-separated": "مفصولة بفواصل",
  "Active (matched to ad sets)": "نشط (يُطابق مع المجموعات)",
  "Delete agent": "حذف المستشار",
  "Also:": "أيضاً:",
  "Count ad data from": "احتساب بيانات الإعلانات من",
  "earlier data stays hidden": "البيانات الأقدم تبقى مخفية",
  "Settings saved": "تم حفظ الإعدادات",
  "Data from": "البيانات من",
  "Saving rematches every imported ad set and campaign to its agent.": "الحفظ يعيد ربط كل مجموعة إعلانية وحملة بمستشارها.",
  "Earlier ad data is kept in the database but hidden here, even on Maximum.": "بيانات الإعلانات الأقدم محفوظة في قاعدة البيانات لكنها مخفية هنا، حتى في الحد الأقصى.",
  "Credited to": "يُحتسب لـ",
  "from the ad set name": "من اسم المجموعة الإعلانية",
  "from the campaign name": "من اسم الحملة",
  "from its ad sets": "من مجموعاتها الإعلانية",
  "No agent found in these names — choose one": "لم يُعثر على مستشار في هذه الأسماء — اختر واحداً",
  "Leave without agent": "بدون مستشار",
  "Agent leaderboard": "ترتيب المستشارين",
  "Who brings registrations, and at what cost. Rank the agents, then switch to graphs to follow each one's trajectory.": "من يجلب التسجيلات وبأي تكلفة. رتّب المستشارين، ثم انتقل إلى الرسوم لمتابعة مسار كل واحد.",
  "Leaderboard": "الترتيب",
  "Graphs": "الرسوم",
  "Rank by": "رتّب حسب",
  "Leader": "في الصدارة",
  "Closing": "الإغلاق",
  "Line": "خط",
  "Bars": "أعمدة",
  "Trajectory": "المسار",
  "Per week": "في الأسبوع",
  "Period": "الفترة",
  "No data in this period": "لا بيانات في هذه الفترة",
  "Running total since the start of the period": "المجموع التراكمي منذ بداية الفترة",
  "Running cost since the start of the period": "التكلفة التراكمية منذ بداية الفترة",
  "Total inside each day": "المجموع في كل يوم",
  "Total inside each week": "المجموع في كل أسبوع",
  "Cost inside each day": "التكلفة في كل يوم",
  "Cost inside each week": "التكلفة في كل أسبوع",
  "Mo": "ن", "Tu": "ث", "We": "ر", "Th": "خ", "Fr": "ج", "Sa": "س", "Su": "ح",
});

arDynamic.push(
  [/^Results from (\d+) campaigns?$/, "نتائج $1 حملة"],
  [/^Results from (\d+) ad sets?$/, "نتائج $1 مجموعة إعلانية"],
  [/^Results from (\d+) ads?$/, "نتائج $1 إعلان"],
  [/^(\d+) ad set$/, "$1 مجموعة إعلانية"],
  [/^(\d+) ad$/, "$1 إعلان"],
  [/^(\d+) campaign$/, "$1 حملة"],
  [/^Code (.+)$/, "الرمز $1"],
  [/^(\d+)% under break-even$/, "$1% تحت نقطة التعادل"],
  [/^(\d+)% over break-even$/, "$1% فوق نقطة التعادل"],
  [/^(\d+)% of break-even spent$/, "صُرف $1% من نقطة التعادل"],
  [/^(\d+)% of spend at this level$/, "$1% من الصرف في هذا المستوى"],
  [/^Data from (.+)$/, "البيانات من $1"],
  [/^(.+) behind #1$/, "$1 خلف الأول"],
  [/^(.+) more than #1$/, "$1 أكثر من الأول"],
  [/^(.+) less than #1$/, "$1 أقل من الأول"],
  [/^No data before (.+)$/, "لا بيانات قبل $1"],
  [/^"(.+)" is not an agent yet$/, "«$1» ليس مستشاراً بعد"],
  [/^Ad data counts from (.+)\. Earlier data is kept but hidden here\.$/, "تُحتسب بيانات الإعلانات من $1. البيانات الأقدم محفوظة لكنها مخفية هنا."],
);

arDynamic.push(
  [/^En avance de (.+)$/, "متقدم بـ $1"],
  [/^En retard de (.+)$/, "متأخر بـ $1"],
  [/^(.+) étudiant\(s\)$/, "$1 طالب/طلبة"],
  [/^(.+) reste$/, "$1 الباقي"],
  [/^(.+) each month$/, "$1 كل شهر"],
  [/^(.+) payments$/, "$1 دفعات"],
  [/^Next: (.+)$/, "القادم: $1"],
  [/^Due in (.+) days$/, "مستحق بعد $1 أيام"],
  [/^(.+) days late$/, "متأخر بـ $1 أيام"],
  [/^(\d+) créneau libre$/, "$1 وقت متاح"],
  [/^(\d+) créneaux libres$/, "$1 أوقات متاحة"],
  [/^(\d+) conflit$/, "$1 تعارض"],
  [/^(\d+) conflits$/, "$1 تعارضات"],
  [/^(\d+) conflit possible$/, "$1 تعارض محتمل"],
  [/^(\d+) conflits possibles$/, "$1 تعارضات محتملة"],
  [/^(\d+) groupes? déjà dans ce créneau$/, "$1 أفواج موجودة في هذا الوقت"],
  [/^(.+) formations et (.+) groupes chargés depuis l'image\.$/, "تم تحميل $1 تكوينات و $2 أفواج من الصورة."],
  [/^(.+) KB · ready to import$/, "$1 KB · جاهز للاستيراد"],
  [/^Créez d'abord un agent nommé (.+) avec le compte admin\.$/, "أنشئ أولاً مستشاراً باسم $1 من حساب المدير."],
  [/^Capacité proposée: (.+) étudiants$/, "الطاقة المقترحة: $1 طالب"],
  [/^(.+) places libres$/, "$1 مقاعد شاغرة"],
  [/^(.+) places restantes$/, "$1 مقاعد متبقية"],
  [/^(.+) étudiants$/, "$1 طلبة"],
  [/^(.+) reste$/, "الباقي $1"],
  [/^(.+) payé$/, "مدفوع $1"],
  [/^Ajouter paiement pour (.+)$/, "إضافة أداء لـ $1"],
  [/^Modifier (.+)$/, "تعديل $1"],
  [/^Select (.+)$/, "اختر $1"],
  [/^No (.+) available$/, "لا يوجد $1 متاح"],
  [/^This backup contains (.+) CRM records\. Current data will be replaced after a safety backup is created\.$/, "تحتوي هذه النسخة على $1 سجل في النظام. سيتم استبدال البيانات الحالية بعد إنشاء نسخة أمان."],
  [/^(.+) rows synced · (.+) new ads · (.+) updated$/, "تمت مزامنة $1 صف · $2 إعلانات جديدة · $3 تحديث"],
);
const overviewMetricDefinitions = {
  spend: { label: "Spend", color: "#0f172a", format: (row) => money(row.spend) },
  messages: { label: "Messages", color: "#2563eb", format: (row) => number(row.messages) },
  booked: { label: "Booked", color: "#d97706", format: (row) => number(row.booked) },
  visited: { label: "Visited", color: "#7c3aed", format: (row) => number(row.visited) },
  registered: { label: "Registered", color: "#16a34a", format: (row) => number(row.registered) },
  costRegisteredEfficiency: { label: "Cost/register improves", color: "#dc2626", inverted: true, format: (row) => row.registered ? cost(row.spend, row.registered) : "-" },
};
const filters = { from: "", to: "", agentId: "", objective: "", campaignId: "", search: "" };
const operationsFilters = { trainingId: "", timing: "", payment: "", search: "" };
const studentsFilters = { trainingId: "", groupId: "", status: "", payment: "", search: "" };
let groupBy = "ad";
let sortBy = "quality";
let selectedPeriod = localStorage.getItem("cmcg-report-period") || "last7";
let currentLanguage = localStorage.getItem("cmcg-language") || "base";
const i18nTextNodes = new WeakMap();
const i18nAttrNodes = new WeakMap();

function readOverviewMetrics() {
  try {
    const stored = JSON.parse(localStorage.getItem("cmcg-overview-metrics") || "[]");
    if (Array.isArray(stored)) {
      const valid = stored.filter((key) => overviewMetricDefinitions[key]);
      if (valid.length) return new Set(valid);
    }
  } catch {}
  return new Set(["messages", "registered", "costRegisteredEfficiency"]);
}

let selectedOverviewMetrics = readOverviewMetrics();

const columnDefinitions = [
  { key: "entity", label: "Name", required: true },
  { key: "quality", label: "Business quality", required: true },
  { key: "status", label: "Status", default: true },
  { key: "agent", label: "Agent", default: true },
  { key: "objective", label: "Objective", default: true },
  { key: "spend", label: "Spend", default: true, numeric: true },
  { key: "messages", label: "Messages", default: true, numeric: true },
  { key: "booked", label: "Booked", default: true, numeric: true },
  { key: "visits", label: "Total visits", default: true, numeric: true },
  { key: "showed", label: "Showed, no registration", default: true, numeric: true },
  { key: "registered", label: "Registered", default: true, numeric: true },
  { key: "costBooked", label: "Cost / booked", default: true, numeric: true },
  { key: "costVisit", label: "Cost / visit", default: true, numeric: true },
  { key: "costShowed", label: "Cost / showed only", default: false, numeric: true },
  { key: "costRegistered", label: "Cost / registered", default: true, numeric: true },
  { key: "showRate", label: "Show rate", default: false, numeric: true },
  { key: "closeRate", label: "Close rate", default: false, numeric: true },
  { key: "agentClosing", label: "Agent closing", default: false },
  { key: "collected", label: "Encaissé (élèves)", default: false, numeric: true },
  { key: "roi", label: "ROI (encaissé)", default: false, numeric: true },
  { key: "potential", label: "Potentiel (si tout payé)", default: false, numeric: true },
  { key: "potentialRoi", label: "ROI potentiel", default: false, numeric: true },
  { key: "campaign", label: "Campaign", default: false },
  { key: "adSet", label: "Ad set", default: false },
  { key: "code", label: "Short code", default: false },
  { key: "delivery", label: "Delivery", default: false },
  { key: "deliveryLevel", label: "Delivery level", default: false },
  { key: "resultType", label: "Result type", default: false },
  { key: "results", label: "Meta results", default: false, numeric: true },
  { key: "costPerResult", label: "Cost / Meta result", default: false, numeric: true },
  { key: "messagesReplied", label: "Messages replied", default: false, numeric: true },
  { key: "impressions", label: "Impressions", default: false, numeric: true },
  { key: "reach", label: "Reach (reported sum)", default: false, numeric: true },
  { key: "frequency", label: "Frequency", default: false, numeric: true },
  { key: "linkClicks", label: "Link clicks", default: false, numeric: true },
  { key: "shopClicks", label: "Shop clicks", default: false, numeric: true },
  { key: "clicksAll", label: "All clicks", default: false, numeric: true },
  { key: "ctr", label: "Link CTR", default: false, numeric: true },
  { key: "cpc", label: "Link CPC", default: false, numeric: true },
  { key: "ctrAll", label: "All-click CTR", default: false, numeric: true },
  { key: "cpcAll", label: "All-click CPC", default: false, numeric: true },
  { key: "cpm", label: "CPM", default: false, numeric: true },
  { key: "landingPageViews", label: "Landing-page views", default: false, numeric: true },
  { key: "costLandingPageView", label: "Cost / landing-page view", default: false, numeric: true },
  { key: "qualityRanking", label: "Quality ranking", default: false },
  { key: "engagementRanking", label: "Engagement ranking", default: false },
  { key: "conversionRanking", label: "Conversion ranking", default: false },
  { key: "reportingStart", label: "Reporting starts", default: false },
  { key: "reportingEnd", label: "Reporting ends", default: false },
  { key: "account", label: "Account", default: false },
  { key: "accountId", label: "Account ID", default: false },
  { key: "campaignId", label: "Campaign ID", default: false },
  { key: "adSetId", label: "Ad set ID", default: false },
  { key: "adId", label: "Ad ID", default: false },
  { key: "pageId", label: "Page ID", default: false },
  { key: "action", label: "", required: true },
];

function defaultColumns() {
  return columnDefinitions.filter((column) => column.required || column.default).map((column) => column.key);
}

function readColumns() {
  try {
    const stored = JSON.parse(localStorage.getItem("cmcg-visible-columns"));
    const currentVersion = localStorage.getItem("cmcg-columns-version");
    if (Array.isArray(stored) && currentVersion === "3") return new Set([...stored, "entity", "quality", "action"]);
    localStorage.setItem("cmcg-columns-version", "3");
  } catch {}
  return new Set(defaultColumns());
}

let visibleColumns = readColumns();
const byId = (items, id) => (items || []).find((item) => item.id === id) || null;
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const number = (value) => new Intl.NumberFormat("en-MA", { maximumFractionDigits: 2 }).format(Number(value || 0));
const currency = () => state?.settings?.currency || "USD";
const money = (value) => `${new Intl.NumberFormat("en-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency()}`;
const cost = (spend, count) => (count ? money(spend / count) : "—");
// ROI cell: shows revenue/spend as a multiple plus the net (revenue - spend), colored by outcome.
const roiCell = (spend, revenue, net) => {
  if (!spend) return revenue ? `<span class="roi-cell roi-pos">∞ · +${money(revenue)}</span>` : "—";
  const ratio = revenue / spend;
  const cls = net >= 0 ? "roi-pos" : "roi-neg";
  const sign = net >= 0 ? "+" : "−";
  return `<span class="roi-cell ${cls}"><strong>${number(ratio)}×</strong><small>${sign}${money(Math.abs(net))}</small></span>`;
};
const legacyWelcomeMessage = "مرحباً، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان:";

const percent = (value) => Number.isFinite(Number(value)) ? `${number(Number(value) * 100)}%` : "-";

function dateInputValue(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function periodRange(preset = selectedPeriod, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "lifetime") return { from: "", to: "" };
  if (preset === "today") return { from: dateInputValue(today), to: dateInputValue(today) };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: dateInputValue(yesterday), to: dateInputValue(yesterday) };
  }
  if (preset === "thisWeek") {
    const day = today.getDay() || 7;
    return { from: dateInputValue(addDays(today, 1 - day)), to: dateInputValue(today) };
  }
  if (preset === "thisMonth") return { from: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: dateInputValue(today) };
  if (preset === "thisYear") return { from: dateInputValue(new Date(today.getFullYear(), 0, 1)), to: dateInputValue(today) };
  return { from: dateInputValue(addDays(today, -6)), to: dateInputValue(today) };
}

function savePeriod() {
  localStorage.setItem("cmcg-report-period", selectedPeriod);
  localStorage.setItem("cmcg-report-from", filters.from || "");
  localStorage.setItem("cmcg-report-to", filters.to || "");
}

function updatePeriodControls() {
  const preset = document.getElementById("periodPreset");
  if (!preset) return;
  preset.value = selectedPeriod;
  document.getElementById("periodFrom").value = filters.from || "";
  document.getElementById("periodTo").value = filters.to || "";
  document.getElementById("periodSummary").textContent = selectedPeriod === "lifetime" ? "All dates" : `${filters.from || "Start"} to ${filters.to || "Today"}`;
}

function applyPeriodPreset(preset = "last7", shouldRender = true) {
  selectedPeriod = periodLabels[preset] ? preset : "last7";
  if (selectedPeriod === "custom") {
    filters.from = localStorage.getItem("cmcg-report-from") || filters.from;
    filters.to = localStorage.getItem("cmcg-report-to") || filters.to;
  } else {
    const range = periodRange(selectedPeriod);
    filters.from = range.from;
    filters.to = range.to;
  }
  savePeriod();
  updatePeriodControls();
  if (shouldRender && state) render();
}

function initializePeriod() {
  selectedPeriod = periodLabels[selectedPeriod] ? selectedPeriod : "last7";
  if (selectedPeriod === "custom") {
    filters.from = localStorage.getItem("cmcg-report-from") || "";
    filters.to = localStorage.getItem("cmcg-report-to") || "";
  } else {
    const range = periodRange(selectedPeriod);
    filters.from = range.from;
    filters.to = range.to;
  }
}

initializePeriod();

function translatePhrase(value) {
  const text = String(value ?? "");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return text;
  const direct = ar[normalized];
  if (direct) return text.replace(normalized, direct);
  for (const [pattern, replacement] of arDynamic) {
    if (pattern.test(normalized)) return text.replace(normalized, normalized.replace(pattern, replacement));
  }
  for (const delimiter of [" · ", " - ", " — "]) {
    if (normalized.includes(delimiter)) {
      const translated = normalized.split(delimiter).map((part) => translatePhrase(part)).join(delimiter);
      if (translated !== normalized) return text.replace(normalized, translated);
    }
  }
  return text;
}

function applyLanguage(root = document.body) {
  const useArabic = currentLanguage === "ar";
  document.documentElement.lang = useArabic ? "ar" : "en";
  document.documentElement.dir = useArabic ? "rtl" : "ltr";
  document.body.classList.toggle("is-arabic", useArabic);
  const select = document.getElementById("languageSelect");
  if (select) select.value = currentLanguage;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const current = node.nodeValue;
    const stored = i18nTextNodes.get(node);
    const storedTranslation = stored ? translatePhrase(stored) : "";
    const base = stored && current !== stored && current !== storedTranslation ? current : (stored || current);
    i18nTextNodes.set(node, base);
    node.nodeValue = useArabic ? translatePhrase(base) : base;
    node = walker.nextNode();
  }

  root.querySelectorAll?.("[placeholder], [title], [aria-label]").forEach((element) => {
    const stored = i18nAttrNodes.get(element) || {};
    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      const previous = stored[attribute];
      if (!previous || (current !== previous && current !== translatePhrase(previous))) stored[attribute] = current;
      element.setAttribute(attribute, useArabic ? translatePhrase(stored[attribute]) : stored[attribute]);
    });
    i18nAttrNodes.set(element, stored);
  });
}

function applyRoleAccess() {
  const salesOnly = currentUser?.role === "sales";
  document.body.classList.toggle("role-sales", salesOnly);
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("hidden", salesOnly && !["groups", "students"].includes(tab.dataset.tab)));
  document.querySelectorAll("[data-open-import], [data-add-outcome], [data-go-performance], [data-seed-screenshot]").forEach((item) => item.classList.toggle("hidden", salesOnly));
  document.querySelector(".period-card")?.classList.toggle("hidden", salesOnly);
  if (salesOnly && !document.getElementById("groups")?.classList.contains("active")) showPanel("groups", false);
}

function normalizeState() {
  ["adAccounts", "programs", "groups", "students", "payments", "agents", "campaigns", "adSets", "creatives", "imports", "outcomes", "leads", "dailyLogs", "events"].forEach((key) => {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
  });
  state.settings = state.settings || {};
  state.settings.scoring = CmcgQuality.normalizeSettings(state.settings.scoring || state.settings);
  state.groups.forEach((group) => {
    group.sessions = Array.isArray(group.sessions) ? group.sessions.filter((s) => s && s.day && s.timeStart && s.timeEnd) : [];
    group.days = Array.isArray(group.days) ? group.days : String(group.days || "").split(",").map((item) => item.trim()).filter(Boolean);
    group.attendanceMode = group.attendanceMode === "flexible_shift" ? "flexible_shift" : "fixed";
  });
}

function scoringTargets() {
  return CmcgQuality.deriveTargets(state?.settings || {}, []);
}

function formatSavedAt(value) {
  if (!value) return "No saved changes yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved" : `Saved ${date.toLocaleString()}`;
}

function toast(message, type = "success") {
  const element = document.getElementById("toast");
  clearTimeout(toastTimer);
  element.textContent = currentLanguage === "ar" ? translatePhrase(message) : message;
  element.classList.toggle("error", type === "error");
  element.classList.remove("hidden");
  toastTimer = setTimeout(() => element.classList.add("hidden"), 3600);
}

async function api(route, options = {}) {
  const response = await fetch(route, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  const data = await api("/api/state");
  state = data.state;
  normalizeState();
  authEnabled = data.authEnabled;
  sensitiveLocked = Boolean(data.sensitiveLocked);
  currentUser = data.currentUser || { role: "admin", canSeeAdvertising: true, canManageStudentData: true };
  storageInfo = data.storage;
  render();
  const requestedPanel = panelFromLocation();
  if (pageMeta[requestedPanel]) showPanel(requestedPanel, false);
}

function panelFromLocation() {
  const hashPanel = window.location.hash.slice(1).replace(/^view=/, "");
  if (pageMeta[hashPanel]) return hashPanel;
  if (["/groups", "/students", "/operations", "/planning"].includes(window.location.pathname)) return "groups";
  return "";
}

function option(label, value = "") {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function relationForAd(ad) {
  const adSet = byId(state.adSets, ad?.adSetId);
  const campaign = byId(state.campaigns, adSet?.campaignId);
  const account = byId(state.adAccounts, campaign?.accountId);
  const agent = byId(state.agents, adSet?.agentId);
  return { ad, adSet, campaign, account, agent, objective: adSet?.objective || campaign?.objective || "" };
}

function relationForLog(log) {
  // Manual budget logs may attach directly to an agent/campaign/ad set (no creative).
  if (log && !log.creativeId && (log.agentId || log.campaignId || log.adSetId)) {
    const adSet = byId(state.adSets, log.adSetId);
    const campaign = byId(state.campaigns, log.campaignId || adSet?.campaignId);
    const account = byId(state.adAccounts, campaign?.accountId);
    const agent = byId(state.agents, log.agentId || adSet?.agentId);
    return { ad: null, adSet, campaign, account, agent, objective: adSet?.objective || campaign?.objective || "" };
  }
  return relationForAd(byId(state.creatives, log.creativeId));
}

function relationForOutcome(outcome) {
  const ad = byId(state.creatives, outcome.creativeId);
  const adSet = byId(state.adSets, outcome.adSetId || ad?.adSetId);
  const campaign = byId(state.campaigns, outcome.campaignId || adSet?.campaignId);
  const agent = byId(state.agents, outcome.agentId || adSet?.agentId);
  return { ad, adSet, campaign, agent, objective: adSet?.objective || campaign?.objective || "" };
}

// range defaults to the global reporting period; the Ads Manager table passes its own.
function overlapsRange(start, end, range = filters) {
  return (!range.from || (end || start) >= range.from) && (!range.to || start <= range.to);
}

function relationMatches(relation, text = "") {
  if (filters.agentId && relation.agent?.id !== filters.agentId) return false;
  if (filters.objective && relation.objective !== filters.objective) return false;
  if (filters.campaignId && relation.campaign?.id !== filters.campaignId) return false;
  if (filters.search) {
    const haystack = [relation.ad?.name, relation.adSet?.name, relation.campaign?.name, relation.agent?.name, relation.objective, text].join(" ").toLocaleLowerCase();
    if (!haystack.includes(filters.search.toLocaleLowerCase())) return false;
  }
  return true;
}

function filteredLogs(range = filters) {
  return state.dailyLogs.filter((log) => {
    const start = log.reportingStart || log.date || "";
    const end = log.reportingEnd || log.date || start;
    return overlapsRange(start, end, range) && relationMatches(relationForLog(log));
  });
}

function filteredOutcomes(range = filters) {
  return state.outcomes.filter((outcome) => overlapsRange(outcome.sourceDate || outcome.date, outcome.date, range)
    && relationMatches(relationForOutcome(outcome), [outcome.personName, outcome.phone, outcome.notes].join(" ")));
}

function emptyMetrics() {
  return { spend: 0, messages: 0, messagesReplied: 0, results: 0, impressions: 0, reach: 0, linkClicks: 0, shopClicks: 0, clicksAll: 0, landingPageViews: 0, booked: 0, showed: 0, registered: 0, visits: 0, collected: 0, potential: 0, firstActivityDate: "", lastActivityDate: "" };
}

function recordActivityDate(target, value) {
  const date = dateOnly(value);
  if (!date) return;
  if (!target.firstActivityDate || date < target.firstActivityDate) target.firstActivityDate = date;
  if (!target.lastActivityDate || date > target.lastActivityDate) target.lastActivityDate = date;
}

function addLogMetrics(target, log) {
  ["spend", "messages", "messagesReplied", "results", "impressions", "reach", "linkClicks", "shopClicks", "clicksAll", "landingPageViews"].forEach((key) => { target[key] += Number(log[key] || 0); });
  recordActivityDate(target, log.reportingStart || log.date);
  recordActivityDate(target, log.reportingEnd || log.date);
}

function groupKeyForRelation(relation, type) {
  if (type === "ad") return relation.ad?.id || "";
  if (type === "adSet") return relation.adSet?.id || "";
  if (type === "campaign") return relation.campaign?.id || "";
  return relation.agent?.id || "__unassigned";
}

function groupDescriptor(key, type) {
  if (key === "__unassigned") return { key, name: "Unassigned", targetId: "", relation: {} };
  if (type === "ad") {
    const ad = byId(state.creatives, key);
    return { key, name: ad?.name || "Unknown ad", targetId: ad?.id || "", relation: relationForAd(ad) };
  }
  if (type === "adSet") {
    const adSet = byId(state.adSets, key);
    const campaign = byId(state.campaigns, adSet?.campaignId);
    const account = byId(state.adAccounts, campaign?.accountId);
    const agent = byId(state.agents, adSet?.agentId);
    return { key, name: adSet?.name || "Unknown ad set", targetId: adSet?.id || "", relation: { adSet, campaign, account, agent, objective: adSet?.objective || campaign?.objective || "" } };
  }
  if (type === "campaign") {
    const campaign = byId(state.campaigns, key);
    const account = byId(state.adAccounts, campaign?.accountId);
    return { key, name: campaign?.name || "Unknown campaign", targetId: campaign?.id || "", relation: { campaign, account, objective: campaign?.objective || "" } };
  }
  const agent = byId(state.agents, key);
  return { key, name: agent?.name || "Unknown agent", targetId: agent?.id || "", relation: { agent } };
}

// Money linked to an agent from the school side, for ROI against ad spend.
// collected = payments received (optionally within the reporting window);
// potential = full agreed price of the agent's non-cancelled students (best case if all pay).
function agentRevenue(agentId, useFilters = true, range = filters) {
  if (!agentId) return { collected: 0, potential: 0 };
  const students = state.students.filter((s) => s.agentId === agentId && s.status !== "cancelled");
  const studentIds = new Set(students.map((s) => s.id));
  const potential = students.reduce((sum, s) => sum + Number(s.totalDue || 0), 0);
  const collected = state.payments
    .filter((p) => studentIds.has(p.studentId) && (!useFilters || overlapsRange(p.paidAt, p.paidAt, range)))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { collected, potential };
}

function performanceRows(type = groupBy, useFilters = true, criterion = sortBy, range = filters) {
  const rows = new Map();
  function ensure(key) {
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { ...groupDescriptor(key, type), ...emptyMetrics(), latestLog: null });
    return rows.get(key);
  }
  const logs = useFilters ? filteredLogs(range) : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes(range) : state.outcomes;
  logs.forEach((log) => {
    const relation = relationForLog(log);
    const row = ensure(groupKeyForRelation(relation, type));
    if (!row) return;
    addLogMetrics(row, log);
    if (!row.latestLog || String(log.reportingEnd || log.date) > String(row.latestLog.reportingEnd || row.latestLog.date)) row.latestLog = log;
  });
  outcomes.forEach((outcome) => {
    const relation = relationForOutcome(outcome);
    const key = groupKeyForRelation(relation, type);
    if (type === "ad" && outcome.assignmentLevel !== "ad") return;
    if (type === "adSet" && !outcome.adSetId) return;
    if (type === "campaign" && !outcome.campaignId) return;
    if (type === "agent" && !outcome.agentId) return;
    const row = ensure(key);
    if (row) {
      row[outcome.type] += 1;
      if (outcome.type === "registered" || outcome.type === "showed") row.visits += 1;
      recordActivityDate(row, outcome.sourceDate || outcome.date);
      recordActivityDate(row, outcome.date);
    }
  });
  if (type === "agent") {
    rows.forEach((row) => {
      const revenue = agentRevenue(row.targetId, useFilters, range);
      row.collected = revenue.collected;
      row.potential = revenue.potential;
      row.roi = row.spend > 0 ? revenue.collected / row.spend : 0;
      row.roiNet = revenue.collected - row.spend;
      row.potentialRoi = row.spend > 0 ? revenue.potential / row.spend : 0;
      row.potentialRoiNet = revenue.potential - row.spend;
    });
  }
  return CmcgQuality.sortRows(CmcgQuality.scoreRows([...rows.values()], state.settings), criterion);
}

function overallMetrics(useFilters = true) {
  const values = emptyMetrics();
  const logs = useFilters ? filteredLogs() : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes() : state.outcomes;
  logs.forEach((log) => addLogMetrics(values, log));
  outcomes.forEach((outcome) => {
    values[outcome.type] += 1;
    if (outcome.type === "registered" || outcome.type === "showed") values.visits += 1;
  });
  values.visited = values.visits;
  return values;
}

function overviewDailyRows() {
  const rows = new Map();
  const ensure = (date) => {
    const key = dateOnly(date);
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { date: key, ...emptyMetrics(), visited: 0 });
    return rows.get(key);
  };
  filteredLogs().forEach((log) => {
    const row = ensure(log.reportingEnd || log.date || log.reportingStart);
    if (!row) return;
    addLogMetrics(row, log);
  });
  filteredOutcomes().forEach((outcome) => {
    const row = ensure(outcome.sourceDate || outcome.date);
    if (!row) return;
    row[outcome.type] += 1;
    if (outcome.type === "registered" || outcome.type === "showed") row.visits += 1;
    row.visited = row.visits;
  });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30).map((row) => ({ ...row, visited: row.visits }));
}

function metricRawValue(key, row) {
  if (key === "visited") return row.visited || row.visits || 0;
  if (key === "costRegisteredEfficiency") return row.registered ? row.spend / row.registered : null;
  return Number(row[key] || 0);
}

function metricDisplayValue(key, row) {
  const definition = overviewMetricDefinitions[key];
  if (!definition) return "";
  return definition.format(row);
}

function chartPath(points) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

// ---- Goals ----
const GOAL_METRIC = {
  registered: { metric: "registered", label: "Étudiants inscrits", cumulative: true, lowerIsBetter: false, fmt: (v) => number(v) },
  revenue: { metric: "revenue", label: "Revenu encaissé", cumulative: true, lowerIsBetter: false, fmt: (v) => money(v) },
  cost_per_registered: { metric: "costRegisteredEfficiency", label: "Coût par inscrit", cumulative: false, lowerIsBetter: true, fmt: (v) => money(v) },
};
function goalMetricKey(goal) {
  if (goal.type === "custom") return goal.metric || "registered";
  return GOAL_METRIC[goal.type]?.metric || "registered";
}
function goalIsCumulative(goal) {
  if (goal.type === "custom") return !["costRegisteredEfficiency"].includes(goal.metric);
  return GOAL_METRIC[goal.type]?.cumulative ?? true;
}
function goalLowerIsBetter(goal) {
  if (goal.type === "custom") return goal.metric === "costRegisteredEfficiency";
  return GOAL_METRIC[goal.type]?.lowerIsBetter ?? false;
}
function goalTypeLabel(goal) {
  if (goal.type === "custom") return overviewMetricDefinitions[goal.metric]?.label || goal.metric;
  return GOAL_METRIC[goal.type]?.label || goal.type;
}
// Revenue per day from student payments (for revenue goals).
function revenueOnDate(dateKey) {
  return state.payments.filter((p) => dateOnly(p.paidAt) === dateKey).reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
// Compute a goal's current value, expected-by-now (pace), and status.
function goalProgress(goal) {
  const metricKey = goalMetricKey(goal);
  const cumulative = goalIsCumulative(goal);
  const lower = goalLowerIsBetter(goal);
  const today = todayInput();
  const startMs = new Date(`${goal.from}T00:00:00Z`).getTime();
  const endMs = new Date(`${goal.to}T00:00:00Z`).getTime();
  const nowMs = Math.min(Math.max(new Date(`${today}T00:00:00Z`).getTime(), startMs), endMs);
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
  const elapsedDays = Math.max(0, Math.round((nowMs - startMs) / 86400000) + 1);
  // Sum the metric within [from, min(today,to)] for cumulative goals; else take the period value.
  let current = 0;
  if (metricKey === "revenue") {
    current = state.payments
      .filter((p) => { const d = dateOnly(p.paidAt); return d && d >= goal.from && d <= (today < goal.to ? today : goal.to); })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  } else {
    // Aggregate metric across the period using daily rows within range.
    const rows = goalDailyRows(goal.from, today < goal.to ? today : goal.to);
    if (cumulative) current = rows.reduce((sum, r) => sum + Number(metricRawValue(metricKey, r) || 0), 0);
    else {
      // cost per registered = total spend / total registered across period
      const spend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
      const reg = rows.reduce((s, r) => s + Number(r.registered || 0), 0);
      current = reg ? spend / reg : 0;
    }
  }
  const expected = lower ? goal.target : (goal.target * elapsedDays) / totalDays;
  let percent;
  let status;
  let delta = 0;
  if (lower) {
    // On track if current <= target.
    percent = goal.target > 0 ? Math.min(100, Math.round((goal.target / Math.max(current, 0.0001)) * 100)) : 0;
    const ok = current <= goal.target || current === 0;
    status = ok ? { key: "ahead", label: "Objectif tenu" } : { key: "behind", label: "Au-dessus de l'objectif" };
    delta = current - goal.target;
  } else {
    percent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
    delta = current - expected; // >0 ahead of pace
    const rounded = Math.round(delta);
    if (current >= goal.target) status = { key: "done", label: "Objectif atteint" };
    else if (rounded > 0) status = { key: "ahead", label: `En avance de ${Math.abs(rounded)}` };
    else if (rounded < 0) status = { key: "behind", label: `En retard de ${Math.abs(rounded)}` };
    else status = { key: "ontrack", label: "Dans les temps" };
  }
  return { metricKey, cumulative, lower, current, expected, percent, status, delta, totalDays, elapsedDays };
}
// Every calendar date string from `from` to `to` inclusive (used to span the full goal window).
function eachDay(from, to) {
  const days = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return from ? [from] : [];
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
    if (days.length > 400) break;
  }
  return days;
}
// Daily rows (registered/spend/etc.) between two dates, ignoring the global period filter.
function goalDailyRows(from, to) {
  const rows = new Map();
  const ensure = (date) => {
    const key = dateOnly(date);
    if (!key || key < from || key > to) return null;
    if (!rows.has(key)) rows.set(key, { date: key, ...emptyMetrics(), visited: 0 });
    return rows.get(key);
  };
  state.dailyLogs.forEach((log) => { const r = ensure(log.reportingEnd || log.date || log.reportingStart); if (r) addLogMetrics(r, log); });
  state.outcomes.forEach((o) => { const r = ensure(o.sourceDate || o.date); if (r) { r[o.type] += 1; if (o.type === "registered" || o.type === "showed") r.visits += 1; r.visited = r.visits; } });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
let activeGoalId = localStorage.getItem("cmcg-active-goal") || "";
function activeGoal() {
  if (!state.goals?.length) return null;
  return state.goals.find((g) => g.id === activeGoalId) || state.goals[0];
}
function renderGoals() {
  const container = document.getElementById("goalsList");
  if (!container) return;
  const goals = state.goals || [];
  const current = activeGoal();
  if (!goals.length) {
    container.innerHTML = '<div class="empty">Aucun objectif. Cliquez « + Objectif » pour en fixer un (inscrits, revenu, coût par inscrit…).</div>';
    applyLanguage(container);
    return;
  }
  container.innerHTML = goals.map((goal) => {
    const gp = goalProgress(goal);
    const isMoney = gp.metricKey === "revenue" || gp.metricKey === "costRegisteredEfficiency";
    const cls = gp.status.key === "behind" ? "behind" : (gp.status.key === "done" || gp.status.key === "ahead") ? "ahead" : "ontrack";
    const active = current && current.id === goal.id;
    const cur = isMoney ? money(gp.current) : number(Math.round(gp.current));
    const tgt = isMoney ? money(goal.target) : number(goal.target);
    return `<div class="goal-chip ${cls} ${active ? "active" : ""}" data-goal="${escapeHtml(goal.id)}" role="button" tabindex="0">
      <div class="goal-chip-head"><strong>${escapeHtml(goal.title || goalTypeLabel(goal))}</strong><span class="goal-status-pill ${cls}">${escapeHtml(gp.status.label)}</span></div>
      <div class="goal-chip-figures">${escapeHtml(cur)} <span>/ ${escapeHtml(tgt)}</span></div>
      <div class="goal-progress"><i style="width:${gp.percent}%"></i></div>
      <small>${escapeHtml(goalTypeLabel(goal))} · ${escapeHtml(goal.from)} → ${escapeHtml(goal.to)}</small>
      <span class="goal-actions"><span class="goal-edit" data-edit-goal="${escapeHtml(goal.id)}" role="button" aria-label="Modifier">✎</span><span class="goal-delete" data-delete-goal="${escapeHtml(goal.id)}" role="button" aria-label="Supprimer">✕</span></span>
    </div>`;
  }).join("");
  applyLanguage(container);
}
function syncGoalFormFields() {
  const form = document.getElementById("goalForm");
  if (!form) return;
  const type = form.elements.type.value;
  document.getElementById("goalMetricField")?.classList.toggle("hidden", type !== "custom");
  const label = document.getElementById("goalTargetLabel");
  if (label) label.textContent = type === "revenue" ? "Cible (montant)" : type === "cost_per_registered" ? "Coût max par inscrit" : "Cible (nombre)";
}
let editingGoalId = "";
function openGoalForm({ goalId = "" } = {}) {
  const dialog = document.getElementById("goalDialog");
  const form = document.getElementById("goalForm");
  if (!dialog || !form) { toast("Objectif indisponible sur cette page", "error"); return; }
  const goal = goalId ? byId(state.goals, goalId) : null;
  editingGoalId = goal?.id || "";
  form.reset();
  const heading = dialog.querySelector("h2");
  if (heading) heading.textContent = goal ? "Modifier l'objectif" : "Nouvel objectif";
  if (goal) {
    form.elements.title.value = goal.title || "";
    form.elements.type.value = goal.type || "registered";
    if (form.elements.metric) form.elements.metric.value = goal.metric || "registered";
    form.elements.target.value = goal.target || "";
    form.elements.from.value = goal.from || todayInput();
    form.elements.to.value = goal.to || "";
  } else {
    const today = todayInput();
    const end = new Date(); end.setDate(end.getDate() + 30);
    if (form.elements.from) form.elements.from.value = today;
    if (form.elements.to) form.elements.to.value = end.toISOString().slice(0, 10);
  }
  syncGoalFormFields();
  applyLanguage(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", ""); // fallback if <dialog> API is unavailable
}

// Exact-value single-metric trend. If a goal is active it drives the metric, adds a target
// line, an ideal pace line, and cumulative values; otherwise it charts the one selected card.
let activeChartMetric = localStorage.getItem("cmcg-chart-metric") || "registered";
// Round a max up to a clean axis value (e.g. 57 -> 60, 1234 -> 1500) so ticks read nicely.
// Chart axis top: with a goal/break-even the axis stops exactly at it (0 → 60 uses the full height)
// and only grows, in quarter-goal steps, when a value goes past it.
function axisTop(peak, target) {
  if (!(target > 0)) return niceCeil(peak) || 1;
  if (!(peak > target)) return target;
  const step = target / 4;
  return Math.ceil(peak / step) * step;
}

function axisTicks(top, target) {
  let step = target > 0 ? target / 4 : top / 5;
  while (top / step > 8) step *= 2;
  const ticks = [];
  for (let value = 0; value <= top + step * 1e-6; value += step) ticks.push(value);
  return ticks;
}

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
function renderOverviewChart() {
  const container = document.getElementById("overviewChart");
  if (!container) return;
  const goal = activeGoal();
  const metricKey = goal ? goalMetricKey(goal) : activeChartMetric;
  const definition = overviewMetricDefinitions[metricKey] || overviewMetricDefinitions.registered;
  const isMoney = metricKey === "revenue" || metricKey === "spend" || metricKey === "costRegisteredEfficiency";
  // Only goals with a running target accumulate. Everything else = EXACT per-day value.
  const cumulative = Boolean(goal) && goalIsCumulative(goal);
  const lower = Boolean(goal) && goalLowerIsBetter(goal);

  // Rows. For a goal, the X-axis MUST span the whole goal window (every day from -> to),
  // even future days with no data, so the pace line and the data line share the same scale.
  const today = todayInput();
  let rows;
  if (goal) {
    const dataByDate = new Map(goalDailyRows(goal.from, goal.to).map((r) => [r.date, r]));
    rows = eachDay(goal.from, goal.to).map((date) => dataByDate.get(date) || { date, ...emptyMetrics(), visited: 0 });
  } else {
    rows = overviewDailyRows();
  }
  if (!rows.length) {
    container.innerHTML = '<div class="empty chart-empty">Importez des rapports ou choisissez une période pour voir la courbe.</div>';
    return;
  }

  // Exact values per day; goals accumulate (running total) so the pace line makes sense.
  // For a goal we stop the data line at "today" (future days = null, not drawn).
  let running = 0;
  const values = rows.map((row) => {
    if (goal && row.date > today) return null; // don't draw the future
    const perDay = metricKey === "revenue" ? revenueOnDate(row.date) : metricRawValue(metricKey, row);
    if (cumulative) { running += (perDay === null || !Number.isFinite(perDay)) ? 0 : perDay; return running; }
    return perDay; // exact daily value (may be null for cost/registered on 0-registration days)
  });

  const target = goal ? Number(goal.target) : 0;
  const finite = values.filter((v) => v !== null && Number.isFinite(v));
  // Axis top = the goal itself (full height from 0 to target), growing only if the data goes past it.
  const axisTarget = lower || cumulative ? target : 0;
  const yMax = axisTop(Math.max(...finite, 1), axisTarget);
  const yMin = 0;

  const width = 1000;
  const height = 520; // tall, constant regardless of metric/period
  const pad = { left: isMoney ? 92 : 68, right: 30, top: 30, bottom: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (rows.length === 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const yFor = (value) => pad.top + innerHeight - ((value - yMin) / ((yMax - yMin) || 1)) * innerHeight;

  const grid = axisTicks(yMax, axisTarget).map((value) => {
    const y = yFor(value);
    const label = isMoney ? money(value) : number(Math.round(value * 10) / 10);
    return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" /><text x="${pad.left - 12}" y="${(y + 5).toFixed(1)}" text-anchor="end">${escapeHtml(label)}</text>`;
  }).join("");

  const step = Math.max(1, Math.ceil(rows.length / 8));
  // Skip a regular label that would collide with the last date.
  const xLabels = rows.map((row, index) => ({ row, index })).filter(({ index }) => index === 0 || index === rows.length - 1 || (index % step === 0 && rows.length - 1 - index >= step / 2))
    .map(({ row, index }, i, labels) => `<text x="${xFor(index).toFixed(1)}" y="${height - 18}" text-anchor="${i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}">${escapeHtml(row.date.slice(5))}</text>`).join("");

  const points = values.map((v, i) => (v === null || !Number.isFinite(v)) ? null : { x: xFor(i), y: yFor(v), raw: v, row: rows[i] }).filter(Boolean);
  const pathPoints = points.length === 1 ? [{ ...points[0], x: pad.left }, { ...points[0], x: width - pad.right }] : points;
  const baseY = yFor(0).toFixed(1);
  const dataPath = points.length
    ? `<path class="trend-fill" d="${chartPath(pathPoints)} L ${pathPoints[pathPoints.length - 1].x.toFixed(1)} ${baseY} L ${pathPoints[0].x.toFixed(1)} ${baseY} Z" fill="${definition.color}" /><path class="trend-main" d="${chartPath(pathPoints)}" stroke="${definition.color}" />`
    : "";
  const dots = points.map((p) => `<g class="trend-point"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" stroke="${definition.color}"><title>${escapeHtml(p.row.date)} · ${escapeHtml(isMoney ? money(p.raw) : number(p.raw))}</title></circle><text x="${p.x.toFixed(1)}" y="${(p.y - 14).toFixed(1)}" text-anchor="middle" class="point-value">${escapeHtml(isMoney ? money(p.raw) : number(p.raw))}</text></g>`).join("");

  let goalLayer = "";
  let banner = "";
  if (goal) {
    const gp = goalProgress(goal);
    const targetY = yFor(Math.min(target, yMax));
    goalLayer += `<line class="goal-target" x1="${pad.left}" y1="${targetY.toFixed(1)}" x2="${width - pad.right}" y2="${targetY.toFixed(1)}" /><text class="goal-target-label" x="${width - pad.right}" y="${(targetY - 8).toFixed(1)}" text-anchor="end">🎯 ${escapeHtml(isMoney ? money(target) : number(target))}</text>`;
    if (!lower && cumulative) {
      goalLayer += `<line class="goal-pace" x1="${xFor(0).toFixed(1)}" y1="${yFor(0).toFixed(1)}" x2="${xFor(rows.length - 1).toFixed(1)}" y2="${targetY.toFixed(1)}" />`;
    }
    const cls = gp.status.key === "behind" ? "behind" : (gp.status.key === "done" || gp.status.key === "ahead") ? "ahead" : "ontrack";
    const currentTxt = isMoney ? money(gp.current) : number(Math.round(gp.current));
    const targetTxt = isMoney ? money(target) : number(target);
    banner = `<div class="goal-banner ${cls}">
      <div class="goal-banner-main"><span class="goal-kicker">${escapeHtml(goal.title || goalTypeLabel(goal))}</span><strong>${escapeHtml(currentTxt)} <span>/ ${escapeHtml(targetTxt)}</span></strong><small>${escapeHtml(goal.from)} → ${escapeHtml(goal.to)} · jour ${gp.elapsedDays}/${gp.totalDays}</small></div>
      <div class="goal-banner-status"><span class="goal-status-pill ${cls}">${escapeHtml(gp.status.label)}</span><div class="goal-progress"><i style="width:${gp.percent}%"></i></div><small>${gp.percent}%${lower ? "" : ` · rythme attendu ${escapeHtml(isMoney ? money(gp.expected) : number(Math.round(gp.expected)))}`}</small></div>
    </div>`;
  }

  const switchKeys = ["registered", "visited", "booked", "messages", "spend", "costRegisteredEfficiency"];
  const headline = `<div class="chart-metric-switch">${switchKeys.map((key) => `<button type="button" class="${!goal && key === metricKey ? "active" : ""}" data-chart-metric="${key}">${escapeHtml(overviewMetricDefinitions[key].label)}</button>`).join("")}${goal ? '<button type="button" class="clear-goal-view" data-chart-metric="registered">↩ Vue libre</button>' : ""}</div>`;

  container.innerHTML = `${banner}${headline}<svg class="trend-svg exact" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend graph">${grid}${goalLayer}<g class="trend-lines">${dataPath}${dots}</g><g class="trend-axis">${xLabels}</g></svg><p class="chart-note">${goal ? "Valeurs exactes cumulées vers l'objectif. La ligne pointillée = rythme idéal." : `Valeurs exactes par jour de « ${escapeHtml(definition.label)} ». L'axe s'adapte au nombre réel.`}</p>`;
}

function renderKpis() {
  const values = overallMetrics(true);
  const items = [
    ["Spend", money(values.spend), "from Meta reports", "neutral", "spend"],
    ["Messages", number(values.messages), cost(values.spend, values.messages) + " each", "blue", "messages"],
    ["Booked", number(values.booked), cost(values.spend, values.booked) + " each", "amber", "booked"],
    ["Visited", number(values.visited), `${values.showed} without registration`, "violet", "visited"],
    ["Registered", number(values.registered), cost(values.spend, values.registered) + " each", "green", "registered"],
    ["Cost / registered", cost(values.spend, values.registered), "graph rises when cost falls", "red", "costRegisteredEfficiency"],
  ];
  const highlight = activeGoal() ? "" : activeChartMetric;
  document.getElementById("kpis").innerHTML = items.map(([label, value, detail, style, metric]) => `<button class="kpi ${style} ${highlight === metric ? "selected" : ""}" type="button" data-kpi-metric="${metric}" aria-pressed="${highlight === metric}"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></button>`).join("");
  renderOverviewChart();
  const welcome = document.getElementById("welcomeState");
  welcome.classList.toggle("hidden", state.imports.length > 0);
  if (!state.imports.length) welcome.innerHTML = `<div><strong>Start with your Meta Ads report</strong><p>Import the saved CSV once. Campaigns, ad sets, ads, spend, and messages will appear automatically.</p></div><button class="button primary" type="button" data-open-import>Import first report</button>`;
}

function renderFunnel() {
  const values = overallMetrics(true);
  const data = [["Messages", values.messages], ["Booked", values.booked], ["Visits", values.visited], ["Registered", values.registered]];
  const maximum = Math.max(1, ...data.map(([, value]) => value));
  document.getElementById("funnel").innerHTML = data.map(([label, value]) => {
    const width = Math.max(value ? 3 : 0, Math.round((value / maximum) * 100));
    return `<div class="funnel-row"><span>${label}</span><div class="funnel-track" role="img" aria-label="${escapeHtml(label)}: ${value}"><span style="width:${width}%"></span></div><strong>${number(value)}</strong></div>`;
  }).join("");
}

function renderAttention() {
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  const ambiguous = unassigned.filter((adSet) => adSet.agentMatchStatus === "ambiguous").length;
  const latest = state.imports[0];
  const items = [
    { value: unassigned.length, label: "Unassigned ad sets", detail: unassigned.length ? "Add agents whose names appear in these ad sets." : "Every imported ad set has an agent.", action: "agents" },
    { value: ambiguous, label: "Ambiguous matches", detail: ambiguous ? "More than one agent name was found." : "No conflicting agent names found.", action: "agents" },
    { value: latest ? new Date(latest.importedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Never", label: "Last report import", detail: latest ? `${latest.rows} ad rows synchronized.` : "Import your first Meta Ads CSV.", action: "data" },
  ];
  document.getElementById("attentionList").innerHTML = items.map((item) => `<button type="button" data-tab-link="${item.action}" class="attention-item"><span class="attention-value">${escapeHtml(item.value)}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6 1.4-1.4 7.4 7.4-7.4 7.4L9 18Z"/></svg></button>`).join("");
}

function addOutcomeButton(level, targetId, label) {
  if (!targetId) return "";
  return `<button class="row-add" type="button" data-add-outcome data-level="${level}" data-target="${escapeHtml(targetId)}" aria-label="Add outcome for ${escapeHtml(label)}" title="Add outcome">+</button>`;
}

function qualityBadge(row) {
  const band = CmcgQuality.qualityBand(row);
  const score = row.qualityScore === null || row.qualityScore === undefined ? "-" : row.qualityScore;
  const confidence = row.qualityConfidence?.label || "Low confidence";
  const detail = band.key === "pending" ? `Inside ${row.closingWindowDays || scoringTargets().closingWindowDays}-day closing window` : confidence;
  return `<span class="quality-badge quality-${band.key}" title="${escapeHtml(detail)}"><strong>${score}</strong><span>${escapeHtml(band.label)}<small>${escapeHtml(row.qualityConfidence?.key || "low")}</small></span></span>`;
}

function agentClosingBadge(row) {
  const band = row.agentClosingStatus || { key: "none", label: "No data" };
  const score = row.agentClosingScore === null || row.agentClosingScore === undefined ? "-" : row.agentClosingScore;
  return `<span class="quality-badge quality-${band.key}" title="Agent score uses show rate and visit-to-registration close rate"><strong>${score}</strong><span>${escapeHtml(band.label)}<small>sales</small></span></span>`;
}

function statusPill(row) {
  const band = CmcgQuality.qualityBand(row);
  const confidence = row.qualityConfidence?.label || "Low confidence";
  return `<span class="status-pill quality-${band.key}" title="${escapeHtml(confidence)}">${escapeHtml(band.label)}</span>`;
}

function qualityRowClass(row) {
  return `quality-row-${CmcgQuality.qualityBand(row).key}`;
}

// ---------------------------------------------------------------------------
// Ads Manager (Overview): Facebook-style Campaign -> Ad set -> Ad tree with its
// own date range. Every visible row carries a "+" that records an outcome at
// that exact level, so a collapsed tree only offers campaign-level "+".
// ---------------------------------------------------------------------------
const AM_LEVELS = ["campaign", "adSet", "ad"];
const AM_CHILD = { campaign: "adSet", adSet: "ad", ad: "" };
const AM_TABS = { campaign: "Campaigns", adSet: "Ad sets", ad: "Ads" };
const AM_NAME_HEADERS = { campaign: "Campaign", adSet: "Ad set", ad: "Ad" };
const AM_NOUNS = { campaign: ["campaign", "campaigns"], adSet: ["ad set", "ad sets"], ad: ["ad", "ads"] };
const AM_ICONS = {
  campaign: '<path d="M3 6a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
  adSet: '<path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/>',
  ad: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v8.6l3.5-3.5 2.5 2.5 4-4 4 4V7H5Z"/>',
};
const AM_PRESETS = [
  ["report", "Same as report period"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["todayYesterday", "Today and yesterday"],
  ["last7", "Last 7 days"],
  ["last14", "Last 14 days"],
  ["last28", "Last 28 days"],
  ["last30", "Last 30 days"],
  ["thisWeek", "This week"],
  ["lastWeek", "Last week"],
  ["thisMonth", "This month"],
  ["lastMonth", "Last month"],
  ["thisYear", "This year"],
  ["lifetime", "Maximum"],
  ["custom", "Custom"],
];
const AM_COLUMNS = [
  { key: "delivery", label: "Delivery" },
  { key: "quality", label: "Quality" },
  { key: "agent", label: "Agent" },
  { key: "spend", label: "Amount spent", numeric: true, total: "Total spent" },
  { key: "messages", label: "Messages", numeric: true, total: "Total" },
  { key: "booked", label: "Booked", numeric: true, total: "Total" },
  { key: "visits", label: "Visited", numeric: true, total: "Total" },
  { key: "registered", label: "Registered", numeric: true, total: "Total" },
  { key: "costRegistered", label: "Cost / registration", numeric: true, total: "Per registration" },
];
// Analyze mode: every cost is judged against the break-even cost per registration.
const AM_ANALYZE_COLUMNS = [
  { key: "verdict", label: "Verdict" },
  { key: "costRegistered", label: "Cost / registration", numeric: true, total: "Per registration" },
  { key: "margin", label: "Margin vs break-even", numeric: true, total: "Total margin" },
  { key: "registered", label: "Registered", numeric: true, total: "Total" },
  { key: "costBooked", label: "Cost / RDV", numeric: true, total: "Per RDV" },
  { key: "booked", label: "RDV", numeric: true, total: "Total" },
  { key: "costMessage", label: "Cost / message", numeric: true, total: "Per message" },
  { key: "messages", label: "Messages", numeric: true, total: "Total" },
  { key: "spend", label: "Amount spent", numeric: true, total: "Total spent" },
  { key: "trend", label: "Trend · 6 weeks" },
];
const AM_ASC_FIRST = new Set(["name", "delivery", "agent", "costRegistered", "verdict", "costBooked", "costMessage", "trend"]);
const PF_TIER_ORDER = ["scale", "profit", "edge", "even", "learning", "loss", "losing", "heavy", "idle"];

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" ? value : fallback;
  } catch { return fallback; }
}

let amLevel = AM_LEVELS.includes(localStorage.getItem("cmcg-am-level")) ? localStorage.getItem("cmcg-am-level") : "campaign";
const amOpen = new Set([readStoredJson("cmcg-am-open", [])].flat().filter((key) => typeof key === "string"));
let amPeriod = { preset: "report", from: "", to: "", ...readStoredJson("cmcg-am-period", {}) };
if (!AM_PRESETS.some(([key]) => key === amPeriod.preset)) amPeriod.preset = "report";
let amMode = localStorage.getItem("cmcg-am-mode") === "analyze" ? "analyze" : "enter";
const AM_DEFAULT_SORT = { enter: { key: "quality", dir: "desc" }, analyze: { key: "spend", dir: "desc" } };
function amValidSort(mode, sort) {
  const columns = mode === "analyze" ? AM_ANALYZE_COLUMNS : AM_COLUMNS;
  return sort && (sort.key === "name" || columns.some((column) => column.key === sort.key)) && ["asc", "desc"].includes(sort.dir) ? { key: sort.key, dir: sort.dir } : { ...AM_DEFAULT_SORT[mode] };
}
const storedSorts = readStoredJson("cmcg-am-sorts", {});
const amSorts = { enter: amValidSort("enter", storedSorts.enter || readStoredJson("cmcg-am-sort", null)), analyze: amValidSort("analyze", storedSorts.analyze) };
let amSort = amSorts[amMode];
let amTierFilter = ""; // Analyze mode: show only top-level rows with this verdict
let amChart = null; // drill-down drawer: { key: "level:id", window, metric }
let amEditingBreakEven = false;
let amSearch = "";
let amPicker = null; // draft while the date picker is open: { preset, from, to, month, picking }

function amPresetRange(preset, custom = amPeriod) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = (offset) => dateInputValue(addDays(today, offset));
  if (preset === "report") return { from: filters.from || "", to: filters.to || "" };
  if (preset === "custom") return { from: custom.from || "", to: custom.to || custom.from || "" };
  if (preset === "todayYesterday") return { from: day(-1), to: day(0) };
  if (preset === "last14") return { from: day(-13), to: day(0) };
  if (preset === "last28") return { from: day(-27), to: day(0) };
  if (preset === "last30") return { from: day(-29), to: day(0) };
  if (preset === "lastWeek") {
    const weekday = today.getDay() || 7;
    return { from: day(1 - weekday - 7), to: day(-weekday) };
  }
  if (preset === "lastMonth") return { from: dateInputValue(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 0)) };
  return periodRange(preset);
}

function amLocale() { return currentLanguage === "ar" ? "ar-MA" : "en-US"; }
function amDateLabel(value) {
  const date = parseInputDate(value);
  return date ? date.toLocaleDateString(amLocale(), { month: "short", day: "numeric", year: "numeric" }) : "";
}
function amRangeText(range) {
  if (amRangeIsEmpty(range)) return `No data before ${amDateLabel(range.from)}`;
  if (!range.from && !range.to) return "All dates";
  if (range.from === range.to) return amDateLabel(range.from);
  return `${amDateLabel(range.from) || "Start"} – ${amDateLabel(range.to) || "Today"}`;
}
function amPresetLabel(preset) { return (AM_PRESETS.find(([key]) => key === preset) || [])[1] || "Custom"; }
function amNoun(level, count) { return AM_NOUNS[level][count === 1 ? 0 : 1]; }
function amIcon(level, className = "fbam-level-icon") { return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24">${AM_ICONS[level]}</svg>`; }
function amRoot() { return document.getElementById("adsManager"); }

function amSavePrefs() {
  try {
    localStorage.setItem("cmcg-am-level", amLevel);
    localStorage.setItem("cmcg-am-open", JSON.stringify([...amOpen]));
    localStorage.setItem("cmcg-am-period", JSON.stringify(amPeriod));
    amSorts[amMode] = amSort;
    localStorage.setItem("cmcg-am-sorts", JSON.stringify(amSorts));
    localStorage.setItem("cmcg-am-mode", amMode);
  } catch {}
}

function amBuildData(range, ctx = null) {
  const rows = {};
  AM_LEVELS.forEach((level) => { rows[level] = performanceRows(level, true, "quality", range); });
  if (ctx) {
    AM_LEVELS.forEach((level) => { ctx.levelSpend[level] = rows[level].reduce((sum, row) => sum + Number(row.spend || 0), 0); });
    AM_LEVELS.forEach((level) => rows[level].forEach((row) => { row.pf = amProfile(row, level, ctx); }));
  }
  const children = { campaign: new Map(), adSet: new Map() };
  const attach = (map, parentId, row) => {
    if (!parentId) return;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(row);
  };
  rows.adSet.forEach((row) => attach(children.campaign, row.relation.campaign?.id, row));
  rows.ad.forEach((row) => attach(children.adSet, row.relation.adSet?.id, row));
  // A campaign has no single agent: list the agents of its ad sets.
  rows.campaign.forEach((row) => {
    const names = [...new Set((children.campaign.get(row.key) || []).map((adSet) => adSet.relation.agent?.name).filter(Boolean))];
    row.amAgent = names.length > 2 ? `${names.length} agents` : names.join(", ");
  });
  return { rows, children };
}

function amChildren(data, level, row) {
  return AM_CHILD[level] ? data.children[level].get(row.key) || [] : [];
}

function amAgentName(row, level) {
  if (level === "campaign") return row.amAgent || "—";
  return row.relation.agent?.name || "Unassigned";
}

function amAgentCell(row, level) {
  const agent = level === "campaign" ? null : row.relation.agent;
  if (!agent) return escapeHtml(amAgentName(row, level));
  const source = row.relation.adSet?.agentMatchSource === "campaign" ? "Matched from the campaign name" : "Matched from the ad set name";
  return `<button class="fbam-agent-link" type="button" data-edit-agent="${escapeHtml(agent.id)}" title="${escapeHtml(`${source} · click to edit`)}">${escapeHtml(agent.name)}</button>`;
}

function amDelivery(row, level) {
  const entity = level === "campaign" ? row.relation.campaign : level === "adSet" ? row.relation.adSet : row.relation.ad;
  const value = String(entity?.deliveryStatus || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!value) return { tone: "none", label: "—" };
  let tone = "off";
  if (/^(active|learning)/.test(value)) tone = "on";
  else if (/complete/.test(value)) tone = "done";
  else if (/error|reject|disapprove|issue/.test(value)) tone = "error";
  return { tone, label: value.charAt(0).toUpperCase() + value.slice(1) };
}

function amSortValue(row, level, key) {
  if (key === "name") return String(row.name || "").toLocaleLowerCase();
  if (key === "delivery") return amDelivery(row, level).label.toLocaleLowerCase();
  if (key === "agent") return amAgentName(row, level).toLocaleLowerCase();
  if (key === "quality") return Number.isFinite(row.qualityScore) ? row.qualityScore : null;
  if (key === "costRegistered") return row.registered ? row.spend / row.registered : null;
  if (key === "costBooked") return row.booked ? row.spend / row.booked : null;
  if (key === "costMessage") return row.messages ? row.spend / row.messages : null;
  if (key === "verdict") return !row.pf || row.pf.reg.key === "idle" ? null : row.pf.reg.rank * 10 + Math.min(row.pf.reg.ratio ?? 0, 9.99);
  if (key === "margin") return !row.pf || row.pf.reg.key === "idle" ? null : row.pf.margin;
  if (key === "trend") {
    const trend = row.pf?.trend;
    if (!trend) return null;
    return Number.isFinite(trend.change) ? trend.change : trend.good ? -1 : 1;
  }
  return Number(row[key] || 0);
}

function amSortRows(rows, level) {
  const sign = amSort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = amSortValue(a, level, amSort.key);
    const right = amSortValue(b, level, amSort.key);
    const byName = String(a.name || "").localeCompare(String(b.name || ""));
    if (left === null || right === null) return left === right ? byName : left === null ? 1 : -1; // blanks always last
    const result = typeof left === "string" ? left.localeCompare(right) : left - right;
    return result * sign || byName;
  });
}

function amMatches(row, query) {
  return [row.name, row.relation?.ad?.code].join(" ").toLocaleLowerCase().includes(query);
}

function amBranchMatches(data, level, row, query) {
  if (amMatches(row, query)) return true;
  return amChildren(data, level, row).some((child) => amBranchMatches(data, AM_CHILD[level], child, query));
}

function amRowHtml(data, level, row, depth, open) {
  const key = `${level}:${row.key}`;
  const childLevel = AM_CHILD[level];
  const childCount = amChildren(data, level, row).length;
  const toggleLabel = `${open ? "Hide" : "Show"} ${childLevel ? AM_NOUNS[childLevel][1] : ""} · ${row.name}`;
  const toggle = childCount
    ? `<button class="fbam-toggle" type="button" data-am-toggle="${escapeHtml(key)}" aria-expanded="${open}" aria-label="${escapeHtml(toggleLabel)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9.4 6 6 6-6 6L8 16.6l4.6-4.6L8 7.4 9.4 6Z"/></svg></button>`
    : '<span class="fbam-toggle-spacer" aria-hidden="true"></span>';
  const analyze = amMode === "analyze";
  let name = `<span class="fbam-name-plain" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>`;
  if (childCount) name = `<button class="fbam-name-link" type="button" data-am-toggle="${escapeHtml(key)}" aria-expanded="${open}" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</button>`;
  else if (analyze) name = `<button class="fbam-name-link" type="button" data-am-chart="${escapeHtml(key)}" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</button>`;
  // Separate text nodes so each part translates on its own (e.g. "Sales" objective vs "2 ad sets").
  const contextParts = level === "ad"
    ? [row.relation.ad?.code ? `Code ${row.relation.ad.code}` : "Ad"]
    : [level === "campaign" ? row.relation.objective : "", `${childCount} ${amNoun(childLevel, childCount)}`].filter(Boolean);
  const context = contextParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('<span aria-hidden="true"> · </span>');
  const identity = `<td class="fbam-name-cell"><div class="fbam-name" style="--depth:${depth}">${toggle}${amIcon(level)}<div class="fbam-name-text">${name}<small>${context}</small></div>${analyze ? amChartButton(key, row.name) : addOutcomeButton(level, row.targetId, row.name)}</div></td>`;
  if (analyze) {
    const cells = amAnalyzeCells(row, level);
    return `<tr class="fbam-row fbam-${level} pf-row pf-row-${row.pf.reg.key}${open ? " is-open" : ""}" data-am-row="${escapeHtml(key)}">${identity}${AM_ANALYZE_COLUMNS.map((column) => `<td class="${column.numeric ? "number-cell" : ""}">${cells[column.key]}</td>`).join("")}</tr>`;
  }
  const delivery = amDelivery(row, level);
  const cells = {
    delivery: `<span class="fbam-delivery"><span class="fbam-dot ${delivery.tone}" aria-hidden="true"></span>${escapeHtml(delivery.label)}</span>`,
    quality: qualityBadge(row),
    agent: amAgentCell(row, level),
    spend: money(row.spend),
    messages: number(row.messages),
    booked: number(row.booked),
    visits: number(row.visits),
    registered: `<strong>${number(row.registered)}</strong>`,
    costRegistered: cost(row.spend, row.registered),
  };
  return `<tr class="fbam-row fbam-${level}${open ? " is-open" : ""}" data-am-row="${escapeHtml(key)}">${identity}${AM_COLUMNS.map((column) => `<td class="${column.numeric ? "number-cell" : ""}">${cells[column.key]}</td>`).join("")}</tr>`;
}

// ---- Analyze mode: profitability against the break-even cost per registration ----
function amBreakEven() { return Number(state.settings?.profit?.breakEvenCostPerRegistered) || 60; }

// Ad data before this day is kept in the database but hidden from the Ads Manager, even on "Maximum".
function amDataStart() { return state?.settings?.profit?.dataStartDate || ""; }
function amClampRange(range) {
  const start = amDataStart();
  return start && (!range.from || range.from < start) ? { from: start, to: range.to } : range;
}
function amRangeIsEmpty(range) { return Boolean(range.from && range.to && range.from > range.to); }

// Conversion totals since the data start date, for the derived RDV / message break-evens.
function amConversionTotals() {
  const start = amDataStart();
  const totals = { messages: 0, booked: 0, registered: 0 };
  state.dailyLogs.forEach((log) => { if (!start || dateOnly(log.reportingEnd || log.date || log.reportingStart) >= start) totals.messages += Number(log.messages || 0); });
  state.outcomes.forEach((outcome) => { if ((!start || dateOnly(outcome.date) >= start) && outcome.type in totals) totals[outcome.type] += 1; });
  return totals;
}

// Per-entity daily spend/messages/RDV/registrations, attributed like performanceRows.
function amDailyBuckets(range) {
  const buckets = new Map();
  const add = (key, date, field, value) => {
    if (!key || !date) return;
    if (!buckets.has(key)) buckets.set(key, new Map());
    const days = buckets.get(key);
    if (!days.has(date)) days.set(date, { spend: 0, messages: 0, booked: 0, registered: 0 });
    days.get(date)[field] += value;
  };
  filteredLogs(range).forEach((log) => {
    const relation = relationForLog(log);
    const date = dateOnly(log.reportingEnd || log.date || log.reportingStart);
    [relation.ad && `ad:${relation.ad.id}`, relation.adSet && `adSet:${relation.adSet.id}`, relation.campaign && `campaign:${relation.campaign.id}`].forEach((key) => {
      add(key, date, "spend", Number(log.spend || 0));
      add(key, date, "messages", Number(log.messages || 0));
    });
  });
  filteredOutcomes(range).forEach((outcome) => {
    if (outcome.type !== "booked" && outcome.type !== "registered") return;
    const date = dateOnly(outcome.sourceDate || outcome.date);
    [outcome.assignmentLevel === "ad" && outcome.creativeId && `ad:${outcome.creativeId}`, outcome.adSetId && `adSet:${outcome.adSetId}`, outcome.campaignId && `campaign:${outcome.campaignId}`]
      .forEach((key) => add(key, date, outcome.type, 1));
  });
  return buckets;
}

function amDaySeries(buckets, key, days) {
  const map = buckets.get(key) || new Map();
  return days.map((date) => ({ date, spend: 0, messages: 0, booked: 0, registered: 0, ...(map.get(date) || {}) }));
}

function amAnalysisContext(range) {
  const breakEven = amBreakEven();
  const end = range.to || dateInputValue(new Date());
  const from = [dateInputValue(addDays(parseInputDate(end), -41)), amDataStart()].sort().pop();
  return {
    breakEven,
    targets: CmcgProfit.derivedBreakEvens(amConversionTotals(), breakEven),
    trendDays: eachDay(from, end),
    trendBuckets: amDailyBuckets({ from, to: end }),
    levelSpend: {},
  };
}

function amProfile(row, level, ctx) {
  const days = amDaySeries(ctx.trendBuckets, `${level}:${row.key}`, ctx.trendDays);
  return {
    breakEven: ctx.breakEven,
    targets: ctx.targets,
    reg: CmcgProfit.verdict(row.spend, row.registered, ctx.breakEven),
    booked: CmcgProfit.verdict(row.spend, row.booked, ctx.targets.booked),
    message: CmcgProfit.verdict(row.spend, row.messages, ctx.targets.message),
    margin: Number(row.registered || 0) * ctx.breakEven - Number(row.spend || 0),
    share: ctx.levelSpend[level] ? Number(row.spend || 0) / ctx.levelSpend[level] : 0,
    weeks: CmcgProfit.bucketCost(days, "registered", 7),
    trend: CmcgProfit.compareCost(days.slice(-28, -14), days.slice(-14), "registered"),
  };
}

function pfVsText(ratio) {
  const diff = Math.round((ratio - 1) * 100);
  if (Math.abs(diff) < 1) return "At break-even";
  return diff < 0 ? `${-diff}% under break-even` : `${diff}% over break-even`;
}

function pfSignedMoney(value) { return `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`; }

function pfBullet(ratio) {
  if (!Number.isFinite(ratio)) return "";
  return `<span class="pf-bullet" aria-hidden="true"><span style="left:${(Math.min(ratio / 2, 1) * 100).toFixed(1)}%"></span></span>`;
}

function pfVerdictChip(verdict, extraClass = "") {
  return `<span class="pf-verdict pf-${verdict.key} ${extraClass}" title="${escapeHtml([verdict.label, verdict.note].filter(Boolean).join(" · "))}"><strong>${escapeHtml(verdict.action)}</strong><small>${escapeHtml(verdict.label)}</small></span>`;
}

function pfCostCell(verdict) {
  if (verdict.key === "idle") return `<span class="pf-dash" title="${escapeHtml(verdict.note)}">—</span>`;
  const title = escapeHtml([verdict.label, verdict.note].filter(Boolean).join(" · "));
  if (verdict.cost === null) {
    return `<div class="pf-cost pf-${verdict.key}" title="${title}"><strong>No registration</strong><small>${Math.round(verdict.ratio * 100)}% of break-even spent</small>${pfBullet(verdict.ratio)}</div>`;
  }
  return `<div class="pf-cost pf-${verdict.key}${verdict.lowData ? " is-low-data" : ""}" title="${title}"><strong>${money(verdict.cost)}</strong><small>${pfVsText(verdict.ratio)}</small>${pfBullet(verdict.ratio)}</div>`;
}

function pfPill(verdict, target, noun) {
  if (verdict.key === "idle") return '<span class="pf-dash">—</span>';
  if (!target) return verdict.cost === null ? '<span class="pf-dash">—</span>' : `<span class="pf-pill pf-neutral">${money(verdict.cost)}</span>`;
  const text = verdict.cost === null ? `0 ${noun}` : money(verdict.cost);
  return `<span class="pf-pill pf-${verdict.key}" title="${escapeHtml(`${verdict.label} · break-even ${money(target)}`)}">${escapeHtml(text)}</span>`;
}

function pfSparkline(points, breakEven) {
  const width = 76;
  const height = 26;
  const pad = 3;
  const finite = points.map((point) => point.value).filter((value) => value !== null);
  if (!finite.length) return `<svg class="pf-spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><line class="pf-spark-empty" x1="${pad}" x2="${width - pad}" y1="${height / 2}" y2="${height / 2}"/></svg>`;
  const max = Math.max(...finite, breakEven) * 1.1;
  const x = (index) => pad + (index * (width - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (value) => height - pad - (value / max) * (height - 2 * pad);
  let path = "";
  let pen = false;
  points.forEach((point, index) => {
    if (point.value === null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`;
    pen = true;
  });
  const dots = points.map((point, index) => point.value === null ? "" : `<circle class="pf-dot-${CmcgProfit.tierForRatio(point.value / breakEven).key}" cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === points.length - 1 ? 2.8 : 1.8}"/>`).join("");
  return `<svg class="pf-spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><line class="pf-spark-be" x1="0" x2="${width}" y1="${y(breakEven).toFixed(1)}" y2="${y(breakEven).toFixed(1)}"/><path d="${path}"/>${dots}</svg>`;
}

function pfTrendLabel(trend) {
  if (!trend) return { text: "—", tone: "flat" };
  const tone = trend.good === true ? "good" : trend.good === false ? "bad" : "flat";
  if (trend.direction === "flat") return { text: "Stable", tone };
  if (Number.isFinite(trend.change)) return { text: `${trend.change < 0 ? "▼" : "▲"} ${Math.abs(Math.round(trend.change * 100))}%`, tone };
  return { text: trend.note || "—", tone };
}

function amChartButton(key, name) {
  return `<button class="fbam-chart-btn" type="button" data-am-chart="${escapeHtml(key)}" aria-label="${escapeHtml(`View charts · ${name}`)}" title="View charts"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19h16v2H2V3h2v16Zm3-3-1.5-1.3 4.2-4.8 3.1 2.7L18 6.7 19.5 8l-6.6 7.6-3-2.6L7 16Z"/></svg></button>`;
}

function amAnalyzeCells(row, level) {
  const pf = row.pf;
  const key = `${level}:${row.key}`;
  const trend = pfTrendLabel(pf.trend);
  const idle = pf.reg.key === "idle";
  return {
    verdict: pfVerdictChip(pf.reg),
    costRegistered: pfCostCell(pf.reg),
    margin: idle ? '<span class="pf-dash">—</span>' : `<strong class="pf-margin ${pf.margin >= 0 ? "is-positive" : "is-negative"}">${pfSignedMoney(pf.margin)}</strong>`,
    registered: `<strong>${number(row.registered)}</strong>${pf.reg.lowData ? '<small class="pf-low">low data</small>' : ""}`,
    costBooked: pfPill(pf.booked, pf.targets.booked, "RDV"),
    booked: number(row.booked),
    costMessage: pfPill(pf.message, pf.targets.message, "messages"),
    messages: number(row.messages),
    spend: `<div class="pf-spend"><span>${money(row.spend)}</span><span class="pf-share" title="${escapeHtml(`${Math.round(pf.share * 100)}% of spend at this level`)}"><span style="width:${(pf.share * 100).toFixed(1)}%"></span></span></div>`,
    trend: `<button class="pf-trend pf-trend-${trend.tone}" type="button" data-am-chart="${escapeHtml(key)}" title="Weekly cost per registration over 6 weeks. Arrow: last 2 weeks vs the 2 weeks before. Click for the full chart.">${pfSparkline(pf.weeks, pf.breakEven)}<span>${escapeHtml(trend.text)}</span></button>`,
  };
}

function amTotals(rows) {
  return rows.reduce((sum, row) => {
    ["spend", "messages", "booked", "visits", "registered"].forEach((key) => { sum[key] += Number(row[key] || 0); });
    return sum;
  }, { spend: 0, messages: 0, booked: 0, visits: 0, registered: 0 });
}

function amSummaryHtml(ctx, rows, totals) {
  const breakEven = ctx.breakEven;
  const targets = ctx.targets;
  const byTier = new Map(PF_TIER_ORDER.map((key) => [key, { count: 0, spend: 0 }]));
  rows.forEach((row) => { const bucket = byTier.get(row.pf.reg.key); bucket.count += 1; bucket.spend += Number(row.spend || 0); });
  const spendOf = (keys) => keys.reduce((sum, key) => sum + byTier.get(key).spend, 0);
  const share = (value) => totals.spend ? `${Math.round((value / totals.spend) * 100)}%` : "0%";
  const segments = PF_TIER_ORDER.filter((key) => byTier.get(key).spend > 0).map((key) => `<span class="pf-seg pf-${key}" style="flex:${byTier.get(key).spend}" title="${escapeHtml(`${CmcgProfit.TIERS[key].label}: ${money(byTier.get(key).spend)} (${share(byTier.get(key).spend)})`)}"></span>`).join("");
  const chips = PF_TIER_ORDER.filter((key) => byTier.get(key).count > 0).map((key) => `<button class="pf-chip pf-${key}${amTierFilter === key ? " is-active" : ""}" type="button" data-pf-tier="${key}" aria-pressed="${amTierFilter === key}" title="${escapeHtml(CmcgProfit.TIERS[key].action)}"><i aria-hidden="true"></i><span>${escapeHtml(CmcgProfit.TIERS[key].label)}</span><strong>${byTier.get(key).count}</strong><small>${money(byTier.get(key).spend)}</small></button>`).join("");
  const overall = CmcgProfit.verdict(totals.spend, totals.registered, breakEven);
  const overallBooked = CmcgProfit.verdict(totals.spend, totals.booked, targets.booked);
  const overallMessage = CmcgProfit.verdict(totals.spend, totals.messages, targets.message);
  const margin = totals.registered * breakEven - totals.spend;
  const canEdit = currentUser?.role !== "sales";
  const breakEvenBlock = amEditingBreakEven
    ? `<form class="pf-be-form" data-pf-be-form><label><span>Break-even cost per registration</span><input name="breakEven" type="number" min="1" step="0.01" value="${breakEven}" required /></label><label><span>Count ad data from <em>earlier data stays hidden</em></span><input name="dataStartDate" type="date" value="${escapeHtml(amDataStart())}" /></label><div class="pf-be-actions"><button class="fbam-btn primary" type="submit">Save</button><button class="fbam-btn" type="button" data-pf-be-cancel>Cancel</button></div></form>`
    : `<div class="pf-be-value"><span class="pf-kicker">Break-even</span><div><strong>${money(breakEven)}</strong><small>per registration</small></div>${amDataStart() ? `<small class="pf-start-note"><span>Data from</span> ${escapeHtml(amDateLabel(amDataStart()))}</small>` : ""}${canEdit ? '<button class="fbam-btn pf-be-edit" type="button" data-pf-edit-be>Edit</button>' : ""}</div>`;
  const derived = [targets.booked ? `<strong>${money(targets.booked)}</strong> <span>per RDV</span>` : "", targets.message ? `<strong>${money(targets.message)}</strong> <span>per message</span>` : ""].filter(Boolean).join(' <span aria-hidden="true">·</span> ');
  const rates = [targets.bookedToRegistered ? `${percent(targets.bookedToRegistered)} <span>of RDVs register</span>` : "", targets.messageToRegistered ? `${percent(targets.messageToRegistered)} <span>of messages register</span>` : ""].filter(Boolean).join(' <span aria-hidden="true">·</span> ');
  const kpi = (label, verdict, value, detail) => `<div class="pf-kpi pf-${verdict ? verdict.key : "neutral"}"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${detail}</small></div>`;
  return `<div class="pf-summary">
    <div class="pf-be">${breakEvenBlock}${derived ? `<p class="pf-derived"><span>Same limit for leading metrics:</span> ${derived}${rates ? `<small><span>From your real conversion:</span> ${rates}</small>` : ""}</p>` : '<p class="pf-derived"><small>Record RDVs and registrations to derive break-even costs per RDV and per message.</small></p>'}</div>
    <div class="pf-kpis">
      ${kpi("Cost / registration", overall, overall.cost === null ? "—" : money(overall.cost), escapeHtml(overall.cost === null ? overall.label : pfVsText(overall.ratio)))}
      ${kpi("Margin vs break-even", { key: margin >= 0 ? "profit" : "losing" }, pfSignedMoney(margin), `<span>${number(totals.registered)} × ${money(breakEven)} − ${money(totals.spend)}</span>`)}
      ${kpi("Cost / RDV", targets.booked ? overallBooked : null, overallBooked.cost === null ? "—" : money(overallBooked.cost), targets.booked ? `<span>break-even</span> ${money(targets.booked)}` : "")}
      ${kpi("Cost / message", targets.message ? overallMessage : null, overallMessage.cost === null ? "—" : money(overallMessage.cost), targets.message ? `<span>break-even</span> ${money(targets.message)}` : "")}
    </div>
    <div class="pf-money">
      <div class="pf-money-head"><strong>Where the money goes</strong><span class="pf-money-split"><span class="pf-good">${share(spendOf(["scale", "profit", "edge"]))} <span>profitable</span></span><span class="pf-warn">${share(spendOf(["even"]))} <span>break-even</span></span><span class="pf-bad">${share(spendOf(["loss", "losing", "heavy"]))} <span>losing</span></span><span class="pf-muted">${share(spendOf(["learning"]))} <span>learning</span></span></span></div>
      <div class="pf-stack" role="img" aria-label="Spend by verdict">${segments || '<span class="pf-seg pf-idle" style="flex:1"></span>'}</div>
      <div class="pf-chips">${chips}${amTierFilter ? '<button class="pf-chip pf-clear" type="button" data-pf-tier="">Show all</button>' : ""}</div>
    </div>
  </div>`;
}

function amCollectRows(data, level, rows, depth, query, out) {
  amSortRows(rows, level).forEach((row) => {
    const children = amChildren(data, level, row);
    const selfMatch = !query || amMatches(row, query);
    const childMatch = !selfMatch && children.some((child) => amBranchMatches(data, AM_CHILD[level], child, query));
    if (!selfMatch && !childMatch) return;
    // While searching, branches that only match through a child open automatically.
    const open = children.length > 0 && (childMatch || amOpen.has(`${level}:${row.key}`));
    out.push(amRowHtml(data, level, row, depth, open));
    if (open) amCollectRows(data, AM_CHILD[level], children, depth + 1, selfMatch ? "" : query, out);
  });
}

function amSortHeader(key, label, numeric = false, extraClass = "") {
  const active = amSort.key === key;
  const ariaSort = active ? (amSort.dir === "asc" ? "ascending" : "descending") : "none";
  const arrow = active && amSort.dir === "asc" ? "▲" : "▼";
  return `<th class="${[numeric ? "number-cell" : "", extraClass].filter(Boolean).join(" ")}" aria-sort="${ariaSort}"><button class="fbam-sort${active ? " active" : ""}" type="button" data-am-sort="${key}"><span>${escapeHtml(label)}</span><span class="fbam-sort-arrow" aria-hidden="true">${arrow}</span></button></th>`;
}

function amShellHtml() {
  const tabs = AM_LEVELS.map((level) => `<button class="fbam-tab" type="button" role="tab" data-am-level="${level}">${amIcon(level, "fbam-tab-icon")}<span>${AM_TABS[level]}</span></button>`).join("");
  const modes = `<div class="fbam-mode" role="tablist" aria-label="Mode"><button type="button" role="tab" data-am-mode="enter"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg><span>Record results</span></button><button type="button" role="tab" data-am-mode="analyze"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19h16v2H2V3h2v16Zm3-3-1.5-1.3 4.2-4.8 3.1 2.7L18 6.7 19.5 8l-6.6 7.6-3-2.6L7 16Z"/></svg><span>Analyze</span></button></div>`;
  return `<div class="fbam-toolbar">${modes}<label class="fbam-search"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg><span class="sr-only">Search by name or code</span><input type="search" data-am-search placeholder="Search by name or code" autocomplete="off" /></label><div class="fbam-date"><button class="fbam-date-button" type="button" data-am-date aria-haspopup="dialog" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h3v17H4V4h3V2Zm11 7H6v10h12V9Zm-9 2v2H7v-2h2Zm4 0v2h-2v-2h2Zm4 0v2h-2v-2h2Zm-8 4v2H7v-2h2Zm4 0v2h-2v-2h2Z"/></svg><span class="fbam-date-text"><strong data-am-date-preset></strong><span data-am-date-range></span></span><svg class="fbam-caret" aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5H7Z"/></svg></button><div class="fbam-picker hidden" data-am-picker role="dialog" aria-label="Date range"></div></div><span class="fbam-start hidden" data-am-start></span></div><div data-am-summary></div><div class="fbam-tabs" role="tablist" aria-label="Level">${tabs}</div><div class="fbam-grid"><table class="fbam-table"></table></div>`;
}

function amMonthHtml(year, month, draft, todayKey) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(year, month + 1, 0).getDate();
  const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((label) => `<span class="fbam-weekday">${label}</span>`).join("");
  const cells = Array.from({ length: offset }, () => '<span class="fbam-day-blank"></span>');
  for (let dayNumber = 1; dayNumber <= days; dayNumber += 1) {
    const key = dateInputValue(new Date(year, month, dayNumber));
    const classes = ["fbam-day"];
    if (draft.from && draft.to && key >= draft.from && key <= draft.to) classes.push("in-range");
    if (key === draft.from) classes.push("is-start");
    if (key === draft.to) classes.push("is-end");
    if (key === todayKey) classes.push("is-today");
    cells.push(`<button class="${classes.join(" ")}" type="button" data-am-day="${key}" ${key > todayKey || (amDataStart() && key < amDataStart()) ? "disabled" : ""} aria-label="${escapeHtml(amDateLabel(key))}">${dayNumber}</button>`);
  }
  return `<div class="fbam-month"><div class="fbam-month-title">${escapeHtml(first.toLocaleDateString(amLocale(), { month: "long", year: "numeric" }))}</div><div class="fbam-month-grid">${weekdays}${cells.join("")}</div></div>`;
}

function amShowDraftMonth() {
  const anchor = parseInputDate(amPicker.to) || new Date();
  amPicker.month = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1); // end month sits on the right
}

function amOpenPicker() {
  const range = amPresetRange(amPeriod.preset);
  amPicker = { preset: amPeriod.preset, from: range.from, to: range.to, picking: "start" };
  amShowDraftMonth();
}

function amCalendarsHtml() {
  const todayKey = dateInputValue(new Date());
  const left = amPicker.month;
  const right = new Date(left.getFullYear(), left.getMonth() + 1, 1);
  return `<button class="fbam-cal-nav prev" type="button" data-am-month="-1" aria-label="Previous month"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.6 6 16 7.4 11.4 12l4.6 4.6-1.4 1.4-6-6 6-6Z"/></svg></button>${amMonthHtml(left.getFullYear(), left.getMonth(), amPicker, todayKey)}${amMonthHtml(right.getFullYear(), right.getMonth(), amPicker, todayKey)}<button class="fbam-cal-nav next" type="button" data-am-month="1" aria-label="Next month"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9.4 6 6 6-6 6L8 16.6l4.6-4.6L8 7.4 9.4 6Z"/></svg></button>`;
}

function renderAdsManagerPicker(root) {
  const picker = root.querySelector("[data-am-picker]");
  root.querySelector("[data-am-date]").setAttribute("aria-expanded", String(Boolean(amPicker)));
  picker.classList.toggle("hidden", !amPicker);
  if (!amPicker) { picker.innerHTML = ""; return; }
  const todayKey = dateInputValue(new Date());
  const presets = AM_PRESETS.map(([key, label]) => `<label class="fbam-preset"><input type="radio" name="amPreset" value="${key}" data-am-preset ${amPicker.preset === key ? "checked" : ""} /><span>${escapeHtml(label)}${key === "report" ? `<small>${escapeHtml(periodLabels[selectedPeriod] || "")}</small>` : ""}</span></label>`).join("");
  picker.innerHTML = `<div class="fbam-picker-body"><div class="fbam-presets" role="radiogroup" aria-label="Date presets">${presets}</div><div class="fbam-cal-area"><div class="fbam-cals">${amCalendarsHtml()}</div><div class="fbam-cal-inputs"><label><span>Start date</span><input type="date" data-am-draft="from" value="${escapeHtml(amPicker.from)}" max="${todayKey}" /></label><span class="fbam-cal-dash" aria-hidden="true">–</span><label><span>End date</span><input type="date" data-am-draft="to" value="${escapeHtml(amPicker.to)}" max="${todayKey}" /></label></div></div></div><div class="fbam-picker-foot"><span class="fbam-note">Only this table changes. The report period at the top stays as it is.</span><div class="fbam-picker-actions"><button class="fbam-btn" type="button" data-am-cancel>Cancel</button><button class="fbam-btn primary" type="button" data-am-apply>Update</button></div></div>`;
}

function renderAdsManagerTable(root, range) {
  const analyze = amMode === "analyze";
  const ctx = analyze ? amAnalysisContext(range) : null;
  const data = amBuildData(range, ctx);
  const query = amSearch.trim().toLocaleLowerCase();
  const searched = data.rows[amLevel].filter((row) => !query || amBranchMatches(data, amLevel, row, query));
  if (analyze && amTierFilter && !searched.some((row) => row.pf.reg.key === amTierFilter)) amTierFilter = "";
  const roots = analyze && amTierFilter ? searched.filter((row) => row.pf.reg.key === amTierFilter) : searched;
  const out = [];
  amCollectRows(data, amLevel, roots, 0, query, out);
  const totals = amTotals(roots);
  const columns = analyze ? AM_ANALYZE_COLUMNS : AM_COLUMNS;
  let empty = "";
  if (!out.length) {
    if (query) empty = `<span>No ${AM_NOUNS[amLevel][1]} match this search.</span>`;
    else if (amRangeIsEmpty(range)) empty = `<span>Ad data counts from ${escapeHtml(amDateLabel(amDataStart()))}. Earlier data is kept but hidden here.</span>`;
    else if (!state.dailyLogs.length && !state.outcomes.length) empty = "<span>Import a Meta Ads report to see campaigns, ad sets, and ads.</span>";
    else empty = `<span>No ${AM_NOUNS[amLevel][1]} had activity in this period.</span>${amPeriod.preset === "lifetime" ? "" : ' <button class="fbam-btn" type="button" data-am-quick="lifetime">Show Maximum</button>'}`;
  }
  const summary = root.querySelector("[data-am-summary]");
  summary.innerHTML = analyze ? amSummaryHtml(ctx, searched, amTotals(searched)) : "";
  let footCells;
  if (analyze) {
    const reg = CmcgProfit.verdict(totals.spend, totals.registered, ctx.breakEven);
    const margin = totals.registered * ctx.breakEven - totals.spend;
    const values = {
      verdict: roots.length ? pfVerdictChip(reg) : "",
      costRegistered: pfCostCell(reg),
      margin: `<strong class="pf-margin ${margin >= 0 ? "is-positive" : "is-negative"}">${pfSignedMoney(margin)}</strong>`,
      registered: number(totals.registered),
      costBooked: pfPill(CmcgProfit.verdict(totals.spend, totals.booked, ctx.targets.booked), ctx.targets.booked, "RDV"),
      booked: number(totals.booked),
      costMessage: pfPill(CmcgProfit.verdict(totals.spend, totals.messages, ctx.targets.message), ctx.targets.message, "messages"),
      messages: number(totals.messages),
      spend: money(totals.spend),
    };
    footCells = columns.map((column) => values[column.key] === undefined ? "<td></td>" : `<td class="${column.numeric ? "number-cell" : ""}">${values[column.key]}${column.total && !["costRegistered", "verdict"].includes(column.key) ? `<small>${escapeHtml(column.total)}</small>` : ""}</td>`).join("");
  } else {
    const totalValues = { spend: money(totals.spend), messages: number(totals.messages), booked: number(totals.booked), visits: number(totals.visits), registered: number(totals.registered), costRegistered: cost(totals.spend, totals.registered) };
    footCells = columns.map((column) => column.total ? `<td class="number-cell"><strong>${totalValues[column.key]}</strong><small>${escapeHtml(column.total)}</small></td>` : "<td></td>").join("");
  }
  const head = `<thead><tr>${amSortHeader("name", AM_NAME_HEADERS[amLevel], false, "fbam-name-cell")}${columns.map((column) => amSortHeader(column.key, column.label, column.numeric)).join("")}</tr></thead>`;
  const body = `<tbody>${out.length ? out.join("") : `<tr><td colspan="${columns.length + 1}" class="empty fbam-empty">${empty}</td></tr>`}</tbody>`;
  const foot = roots.length ? `<tfoot><tr class="fbam-total"><td class="fbam-name-cell"><div class="fbam-name"><div class="fbam-name-text"><strong>Results from ${roots.length} ${amNoun(amLevel, roots.length)}</strong><small>${escapeHtml(amRangeText(range))}</small></div></div></td>${footCells}</tr></tfoot>` : "";
  const table = root.querySelector(".fbam-table");
  table.classList.toggle("is-analyze", analyze);
  table.innerHTML = head + body + foot;
}

function renderAdsManager() {
  const root = amRoot();
  if (!root || !state) return;
  if (!root.dataset.ready) {
    root.innerHTML = amShellHtml();
    root.dataset.ready = "1";
  }
  const range = amClampRange(amPresetRange(amPeriod.preset));
  root.classList.toggle("is-analyze", amMode === "analyze");
  root.querySelectorAll("[data-am-mode]").forEach((button) => {
    const active = button.dataset.amMode === amMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  root.querySelectorAll("[data-am-level]").forEach((tab) => {
    const active = tab.dataset.amLevel === amLevel;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  root.querySelector("[data-am-date-preset]").textContent = amPeriod.preset === "report" ? periodLabels[selectedPeriod] || "Custom" : amPresetLabel(amPeriod.preset);
  root.querySelector("[data-am-date]").title = amPeriod.preset === "report" ? "Same as report period" : "Only this table changes. The report period at the top stays as it is.";
  root.querySelector("[data-am-date-range]").textContent = amRangeText(range);
  root.querySelector("[data-am-date]").classList.toggle("is-override", amPeriod.preset !== "report");
  const startBadge = root.querySelector("[data-am-start]");
  startBadge.classList.toggle("hidden", !amDataStart());
  startBadge.textContent = amDataStart() ? `Data from ${amDateLabel(amDataStart())}` : "";
  startBadge.title = "Earlier ad data is kept in the database but hidden here, even on Maximum.";
  renderAdsManagerPicker(root);
  renderAdsManagerTable(root, range);
  applyLanguage(root);
  if (amChart && document.getElementById("pfDrawer")?.open) renderPfDrawer();
}

function amRenderPickerOnly() {
  const root = amRoot();
  renderAdsManagerPicker(root);
  applyLanguage(root);
}

// Typed dates only redraw the calendars, so the date inputs keep focus while typing.
function amRenderCalendarsOnly() {
  const root = amRoot();
  root.querySelector(".fbam-cals").innerHTML = amCalendarsHtml();
  const radio = root.querySelector(`[data-am-preset][value="${amPicker.preset}"]`);
  if (radio) radio.checked = true;
  applyLanguage(root.querySelector(".fbam-cals"));
}

function amApplyPeriod(next) {
  amPeriod = { preset: next.preset, from: next.from || "", to: next.to || next.from || "" };
  if (amPeriod.from && amPeriod.to && amPeriod.from > amPeriod.to) [amPeriod.from, amPeriod.to] = [amPeriod.to, amPeriod.from];
  amPicker = null;
  amSavePrefs();
  renderAdsManager();
}

function handleAdsManagerClick(event) {
  const mode = event.target.closest("[data-am-mode]");
  if (mode) {
    if (mode.dataset.amMode === amMode) return;
    amSorts[amMode] = amSort;
    amMode = mode.dataset.amMode === "analyze" ? "analyze" : "enter";
    amSort = amSorts[amMode];
    amTierFilter = "";
    amSavePrefs(); renderAdsManager();
    return;
  }
  const chart = event.target.closest("[data-am-chart]");
  if (chart) { openPfDrawer(chart.dataset.amChart); return; }
  const tier = event.target.closest("[data-pf-tier]");
  if (tier) { amTierFilter = amTierFilter === tier.dataset.pfTier ? "" : tier.dataset.pfTier; renderAdsManager(); return; }
  if (event.target.closest("[data-pf-edit-be]")) {
    amEditingBreakEven = true; renderAdsManager();
    amRoot().querySelector('[data-pf-be-form] input[name="breakEven"]')?.select();
    return;
  }
  if (event.target.closest("[data-pf-be-cancel]")) { amEditingBreakEven = false; renderAdsManager(); return; }
  const toggle = event.target.closest("[data-am-toggle]");
  if (toggle) {
    const key = toggle.dataset.amToggle;
    if (amOpen.has(key)) amOpen.delete(key); else amOpen.add(key);
    amSavePrefs(); renderAdsManager();
    return;
  }
  const tab = event.target.closest("[data-am-level]");
  if (tab) { amLevel = tab.dataset.amLevel; amSavePrefs(); renderAdsManager(); return; }
  const sort = event.target.closest("[data-am-sort]");
  if (sort) {
    const key = sort.dataset.amSort;
    amSort = amSort.key === key ? { key, dir: amSort.dir === "asc" ? "desc" : "asc" } : { key, dir: AM_ASC_FIRST.has(key) ? "asc" : "desc" };
    amSavePrefs(); renderAdsManager();
    return;
  }
  const quick = event.target.closest("[data-am-quick]");
  if (quick) { amApplyPeriod({ preset: quick.dataset.amQuick }); return; }
  if (event.target.closest("[data-am-date]")) {
    if (amPicker) amPicker = null; else amOpenPicker();
    amRenderPickerOnly();
    return;
  }
  if (!amPicker) return;
  const monthStep = event.target.closest("[data-am-month]");
  if (monthStep) {
    amPicker.month = new Date(amPicker.month.getFullYear(), amPicker.month.getMonth() + Number(monthStep.dataset.amMonth), 1);
    amRenderCalendarsOnly();
    return;
  }
  const day = event.target.closest("[data-am-day]");
  if (day) {
    // First click picks the start day, the second click closes the range.
    const key = day.dataset.amDay;
    amPicker.preset = "custom";
    if (amPicker.picking === "end" && amPicker.from) {
      if (key < amPicker.from) { amPicker.to = amPicker.from; amPicker.from = key; } else amPicker.to = key;
      amPicker.picking = "start";
    } else {
      amPicker.from = key; amPicker.to = key; amPicker.picking = "end";
    }
    amRenderPickerOnly();
    return;
  }
  if (event.target.closest("[data-am-cancel]")) { amPicker = null; amRenderPickerOnly(); return; }
  if (event.target.closest("[data-am-apply]")) amApplyPeriod(amPicker);
}

function handleAdsManagerChange(event) {
  const preset = event.target.closest("[data-am-preset]");
  if (preset && amPicker) {
    amPicker.preset = preset.value;
    if (preset.value !== "custom") Object.assign(amPicker, amPresetRange(preset.value, amPicker));
    else if (!amPicker.from) Object.assign(amPicker, { from: dateInputValue(new Date()), to: dateInputValue(new Date()) });
    amPicker.picking = "start";
    amShowDraftMonth();
    amRenderPickerOnly();
    return;
  }
  const draft = event.target.closest("[data-am-draft]");
  if (draft && amPicker) {
    amPicker[draft.dataset.amDraft] = draft.value;
    amPicker.preset = "custom";
    if (amPicker.from && amPicker.to && amPicker.from > amPicker.to) [amPicker.from, amPicker.to] = [amPicker.to, amPicker.from];
    amShowDraftMonth();
    amRenderCalendarsOnly();
  }
}

async function handleAdsManagerSubmit(event) {
  const form = event.target.closest("[data-pf-be-form]");
  if (!form) return;
  event.preventDefault();
  const breakEven = Number(form.elements.breakEven.value);
  try {
    const result = await api("/api/settings/profit", { method: "POST", body: JSON.stringify({ breakEvenCostPerRegistered: breakEven, dataStartDate: form.elements.dataStartDate.value }) });
    state.settings = result.settings;
    amEditingBreakEven = false;
    renderAdsManager();
    toast("Settings saved");
  } catch (error) { toast(error.message, "error"); }
}

// ---- Drill-down drawer: trend of cost per result for one campaign / ad set / ad ----
const PF_METRICS = {
  registered: { label: "Cost / registration", result: "registered", noun: "registrations" },
  booked: { label: "Cost / RDV", result: "booked", noun: "RDV" },
  message: { label: "Cost / message", result: "messages", noun: "messages" },
  messages: { label: "Messages", count: "messages" },
  spend: { label: "Amount spent", count: "spend", isMoney: true },
};
const PF_WINDOWS = [["14", "14 days"], ["30", "30 days"], ["90", "90 days"], ["all", "Maximum"]];
let amChartPrefs = { window: "30", metric: "registered", ...readStoredJson("cmcg-am-chart", {}) };
if (!PF_METRICS[amChartPrefs.metric]) amChartPrefs.metric = "registered";
if (!PF_WINDOWS.some(([key]) => key === amChartPrefs.window)) amChartPrefs.window = "30";

function amEntity(level, id) {
  return byId(level === "campaign" ? state.campaigns : level === "adSet" ? state.adSets : state.creatives, id);
}

function pfWindowRange(windowKey) {
  const to = dateInputValue(new Date());
  if (windowKey !== "all") return amClampRange({ from: dateInputValue(addDays(new Date(), 1 - (Number(windowKey) || 30))), to });
  if (amDataStart()) return amClampRange({ from: "", to });
  const floor = dateInputValue(addDays(new Date(), -399));
  const first = state.dailyLogs.reduce((min, log) => { const date = dateOnly(log.reportingStart || log.date); return date && (!min || date < min) ? date : min; }, "");
  return { from: first && first > floor ? first : first ? floor : dateInputValue(addDays(new Date(), -29)), to };
}

function pfAdvice(verdict) {
  if (verdict.key === "idle") return "No spend in this window.";
  if (verdict.key === "learning") return `${money(verdict.spend)} spent without a registration yet — ${Math.round(verdict.ratio * 100)}% of the break-even. Let it spend up to ${money(verdict.breakEven)} before judging.`;
  if (verdict.cost === null) return `${money(verdict.spend)} spent without a registration — ${number(verdict.ratio)}× the break-even.`;
  return `Each registration costs ${money(verdict.cost)} — ${pfVsText(verdict.ratio).toLocaleLowerCase()} (${money(verdict.breakEven)}).${verdict.lowData ? " Few registrations: confirm before acting." : ""}`;
}

function pfTrendSentence(trend, label) {
  if (!trend) return `<span class="pf-trend-line flat"><span>${escapeHtml(label)}</span> <strong>Not enough data</strong></span>`;
  const tone = trend.good === true ? "good" : trend.good === false ? "bad" : "flat";
  const word = tone === "good" ? "improving" : tone === "bad" ? "getting worse" : "stable";
  const change = Number.isFinite(trend.change) && trend.direction !== "flat" ? `${trend.change < 0 ? "▼" : "▲"} ${Math.abs(Math.round(trend.change * 100))}%` : trend.note || "≈";
  const detail = trend.costBefore !== null && trend.costAfter !== null ? `${money(trend.costBefore)} → ${money(trend.costAfter)}` : trend.costAfter !== null ? `→ ${money(trend.costAfter)}` : trend.costBefore !== null ? `${money(trend.costBefore)} →` : "";
  return `<span class="pf-trend-line ${tone}"><span>${escapeHtml(label)}</span> <strong>${escapeHtml(change)}</strong> <em>${word}</em>${detail ? ` <small>${escapeHtml(detail)}</small>` : ""}</span>`;
}

function pfShortDate(value) {
  const date = parseInputDate(value);
  return date ? date.toLocaleDateString(amLocale(), { month: "short", day: "numeric" }) : "";
}

function pfChartSvg(series, metric, target) {
  const width = 720;
  const height = 280;
  const left = 64;
  const right = 18;
  const top = 16;
  const bottom = 34;
  const count = series.length;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index) => left + (count <= 1 ? plotWidth / 2 : (index * plotWidth) / (count - 1));
  const isCost = Boolean(metric.result);
  const format = (value) => (isCost || metric.isMoney ? money(value) : number(value));
  const line = isCost
    ? CmcgProfit.rollingCost(series, metric.result, 7).map((point) => point.value)
    : series.map((day, index) => { const slice = series.slice(Math.max(0, index - 6), index + 1); return slice.reduce((sum, item) => sum + item[metric.count], 0) / slice.length; });
  const bars = series.map((day) => Number(isCost ? day[metric.result] : day[metric.count]) || 0);
  const finite = line.filter((value) => Number.isFinite(value));
  const max = axisTop(Math.max(0, ...finite, isCost ? 0 : Math.max(...bars)), isCost ? target : 0);
  const y = (value) => top + plotHeight * (1 - Math.min(value, max) / max);
  const ticks = axisTicks(max, isCost ? target : 0);
  const grid = ticks.map((value) => `<line class="pf-grid" x1="${left}" x2="${width - right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text class="pf-axis" x="${left - 8}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(format(value))}</text>`).join("");
  const zones = isCost && target ? `<rect class="pf-zone-bad" x="${left}" y="${top}" width="${plotWidth}" height="${Math.max(0, y(target) - top).toFixed(1)}"/><rect class="pf-zone-good" x="${left}" y="${y(target).toFixed(1)}" width="${plotWidth}" height="${Math.max(0, top + plotHeight - y(target)).toFixed(1)}"/><line class="pf-be-line" x1="${left}" x2="${width - right}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/><text class="pf-be-label" x="${width - right - 4}" y="${(y(target) - 6).toFixed(1)}" text-anchor="end">Break-even ${escapeHtml(money(target))}</text>` : "";
  const barMax = Math.max(1, ...bars);
  const barArea = isCost ? plotHeight * 0.22 : plotHeight;
  const barWidth = Math.max(2, Math.min(18, (plotWidth / Math.max(1, count)) * 0.6));
  const barMarks = bars.map((value, index) => value ? `<rect class="pf-bar${isCost ? " is-results" : ""}" x="${(x(index) - barWidth / 2).toFixed(1)}" y="${(top + plotHeight - (value / (isCost ? barMax : max)) * barArea).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${((value / (isCost ? barMax : max)) * barArea).toFixed(1)}"><title>${escapeHtml(`${series[index].date}: ${isCost ? `${number(value)} ${metric.noun}` : format(value)}`)}</title></rect>` : "").join("");
  let path = "";
  let pen = false;
  line.forEach((value, index) => {
    if (!Number.isFinite(value)) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
    pen = true;
  });
  const lastIndex = line.map((value, index) => (Number.isFinite(value) ? index : -1)).filter((index) => index >= 0).pop();
  const points = line.map((value, index) => Number.isFinite(value) ? `<circle class="pf-point${isCost && target ? ` pf-dot-${CmcgProfit.tierForRatio(value / target).key}` : ""}" cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="${index === lastIndex ? 5 : 2.6}"><title>${escapeHtml(`${series[index].date}: ${format(value)}`)}</title></circle>` : "").join("");
  const labelIndexes = [...new Set([0, Math.floor((count - 1) / 2), count - 1])].filter((index) => index >= 0);
  const xLabels = labelIndexes.map((index) => `<text class="pf-axis" x="${x(index).toFixed(1)}" y="${height - 10}" text-anchor="${index === 0 ? "start" : index === count - 1 ? "end" : "middle"}">${escapeHtml(pfShortDate(series[index].date))}</text>`).join("");
  const empty = !finite.length && !bars.some(Boolean) ? `<text class="pf-empty-text" x="${left + plotWidth / 2}" y="${top + plotHeight / 2}" text-anchor="middle">No data in this window</text>` : "";
  return `<svg class="pf-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)}">${zones}${grid}${barMarks}<path class="pf-line" d="${path}"/>${points}${xLabels}${empty}</svg>`;
}

function ensurePfDrawer() {
  let dialog = document.getElementById("pfDrawer");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "pfDrawer";
  dialog.className = "pf-drawer";
  dialog.setAttribute("aria-labelledby", "pfDrawerTitle");
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-pf-close]")) { dialog.close(); return; }
    const windowButton = event.target.closest("[data-pf-window]");
    const metricButton = event.target.closest("[data-pf-metric]");
    const open = event.target.closest("[data-pf-open]");
    if (windowButton) amChartPrefs.window = windowButton.dataset.pfWindow;
    if (metricButton) amChartPrefs.metric = metricButton.dataset.pfMetric;
    if (open) { amChart.key = open.dataset.pfOpen; dialog.scrollTop = 0; }
    if (windowButton || metricButton || open) {
      try { localStorage.setItem("cmcg-am-chart", JSON.stringify(amChartPrefs)); } catch {}
      renderPfDrawer();
    }
  });
  dialog.addEventListener("close", () => { amChart = null; });
  return dialog;
}

function openPfDrawer(key) {
  const dialog = ensurePfDrawer();
  amChart = { key };
  renderPfDrawer();
  if (!dialog.open) dialog.showModal();
}

function renderPfDrawer() {
  const dialog = ensurePfDrawer();
  if (!amChart) return;
  const [level, id] = amChart.key.split(":");
  const entity = amEntity(level, id);
  const range = pfWindowRange(amChartPrefs.window);
  const series = amDaySeries(amDailyBuckets(range), amChart.key, eachDay(range.from, range.to));
  const row = performanceRows(level, true, "quality", range).find((item) => item.key === id) || { ...emptyMetrics(), key: id, name: entity?.name || "Unknown", relation: {} };
  const breakEven = amBreakEven();
  const targets = CmcgProfit.derivedBreakEvens(amConversionTotals(), breakEven);
  const metricTargets = { registered: breakEven, booked: targets.booked, message: targets.message };
  const reg = CmcgProfit.verdict(row.spend, row.registered, breakEven);
  const booked = CmcgProfit.verdict(row.spend, row.booked, targets.booked);
  const message = CmcgProfit.verdict(row.spend, row.messages, targets.message);
  const margin = Number(row.registered || 0) * breakEven - Number(row.spend || 0);
  const metric = PF_METRICS[amChartPrefs.metric];
  const target = metricTargets[amChartPrefs.metric] || null;
  const adSet = level === "ad" ? byId(state.adSets, entity?.adSetId) : level === "adSet" ? entity : null;
  const campaign = level === "campaign" ? entity : byId(state.campaigns, adSet?.campaignId);
  const crumbs = [level !== "campaign" && campaign ? `<button type="button" data-pf-open="campaign:${escapeHtml(campaign.id)}">${amIcon("campaign")}<span>${escapeHtml(campaign.name)}</span></button>` : "", level === "ad" && adSet ? `<button type="button" data-pf-open="adSet:${escapeHtml(adSet.id)}">${amIcon("adSet")}<span>${escapeHtml(adSet.name)}</span></button>` : ""].filter(Boolean).join('<span aria-hidden="true">›</span>');
  const kpi = (label, value, verdict, detail = "") => `<div class="pf-kpi pf-${verdict ? verdict.key : "neutral"}"><span>${escapeHtml(label)}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ""}</div>`;
  const resultKey = metric.result || "registered";
  const trendLabel = metric.result ? metric.label : "Cost / registration";
  const childLevel = AM_CHILD[level];
  let breakdown = "";
  if (childLevel) {
    const kids = performanceRows(childLevel, true, "quality", range)
      .filter((child) => (childLevel === "adSet" ? child.relation.campaign?.id : child.relation.adSet?.id) === id)
      .sort((a, b) => b.spend - a.spend);
    breakdown = `<section class="pf-drawer-section"><h3>${escapeHtml(AM_TABS[childLevel])} <small>${escapeHtml(PF_WINDOWS.find(([key]) => key === amChartPrefs.window)[1])}</small></h3>${kids.length ? `<div class="pf-kids">${kids.map((child) => {
      const verdict = CmcgProfit.verdict(child.spend, child.registered, breakEven);
      const share = row.spend ? child.spend / row.spend : 0;
      return `<button class="pf-kid pf-${verdict.key}" type="button" data-pf-open="${childLevel}:${escapeHtml(child.key)}"><span class="pf-kid-name"><strong>${escapeHtml(child.name)}</strong><small>${escapeHtml(verdict.action)}</small></span><span class="pf-kid-spend">${money(child.spend)}<span class="pf-share"><span style="width:${(share * 100).toFixed(1)}%"></span></span></span><span class="pf-kid-reg">${number(child.registered)} <small>reg.</small></span>${pfPill(verdict, breakEven, "reg.")}</button>`;
    }).join("")}</div>` : `<p class="pf-muted-text">No ${escapeHtml(AM_NOUNS[childLevel][1])} with activity in this window.</p>`}</section>`;
  }
  const levelLabel = AM_NAME_HEADERS[level];
  dialog.innerHTML = `<div class="pf-drawer-inner">
    <header class="pf-drawer-head">
      <div class="pf-drawer-title">${crumbs ? `<nav class="pf-crumbs" aria-label="Parents">${crumbs}</nav>` : ""}<p class="pf-kicker">${amIcon(level)}<span>${escapeHtml(levelLabel)}</span></p><h2 id="pfDrawerTitle">${escapeHtml(row.name || entity?.name || "Unknown")}</h2></div>
      <div class="pf-drawer-actions">${addOutcomeButton(level, id, row.name || "")}<button class="icon-button" type="button" data-pf-close aria-label="Close"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg></button></div>
    </header>
    <div class="pf-windows" role="group" aria-label="Window">${PF_WINDOWS.map(([key, label]) => `<button type="button" class="${amChartPrefs.window === key ? "active" : ""}" data-pf-window="${key}" aria-pressed="${amChartPrefs.window === key}">${escapeHtml(label)}</button>`).join("")}<span class="pf-window-range">${escapeHtml(amRangeText(range))}</span></div>
    <div class="pf-advice pf-${reg.key}">${pfVerdictChip(reg, "is-large")}<p>${escapeHtml(pfAdvice(reg))}</p></div>
    <div class="pf-kpis pf-drawer-kpis">
      ${kpi("Cost / registration", reg.cost === null ? "—" : money(reg.cost), reg, escapeHtml(reg.cost === null ? reg.label : pfVsText(reg.ratio)))}
      ${kpi("Margin vs break-even", pfSignedMoney(margin), { key: reg.key === "idle" ? "idle" : margin >= 0 ? "profit" : "losing" })}
      ${kpi("Cost / RDV", booked.cost === null ? "—" : money(booked.cost), targets.booked ? booked : null, targets.booked ? `<span>break-even</span> ${money(targets.booked)}` : "")}
      ${kpi("Cost / message", message.cost === null ? "—" : money(message.cost), targets.message ? message : null, targets.message ? `<span>break-even</span> ${money(targets.message)}` : "")}
      ${kpi("Amount spent", money(row.spend), null)}
      ${kpi("Registered", number(row.registered), null)}
      ${kpi("RDV", number(row.booked), null)}
      ${kpi("Messages", number(row.messages), null)}
    </div>
    <section class="pf-drawer-section">
      <div class="pf-metric-switch" role="group" aria-label="Metric">${Object.entries(PF_METRICS).map(([key, item]) => `<button type="button" class="${amChartPrefs.metric === key ? "active" : ""}" data-pf-metric="${key}" aria-pressed="${amChartPrefs.metric === key}">${escapeHtml(item.label)}</button>`).join("")}</div>
      <div class="pf-trends">${pfTrendSentence(CmcgProfit.compareCost(series.slice(-14, -7), series.slice(-7), resultKey), `${trendLabel} · last 7 days vs the 7 before:`)}${pfTrendSentence(CmcgProfit.halfTrend(series, resultKey), `${trendLabel} · 2nd half vs 1st half of the window:`)}</div>
      <div class="pf-chart-wrap">${pfChartSvg(series, metric, target)}</div>
      <p class="pf-chart-legend">${metric.result ? `<span><i class="pf-lg-line"></i>7-day rolling ${escapeHtml(metric.label.toLocaleLowerCase())}</span><span><i class="pf-lg-bar is-results"></i>${escapeHtml(metric.noun)} per day</span>${target ? '<span><i class="pf-lg-be"></i>Break-even</span>' : ""}` : `<span><i class="pf-lg-bar"></i>Per day</span><span><i class="pf-lg-line"></i>7-day average</span>`}</p>
    </section>
    ${breakdown}
  </div>`;
  applyLanguage(dialog);
}

// ---- Agent leaderboard (Overview): rank agents, colour them against break-even, graph their trajectory ----
const AB_METRICS = {
  registered: { label: "Registered", kind: "count", better: "high" },
  booked: { label: "RDV", kind: "count", better: "high" },
  costRegistered: { label: "Cost / registration", kind: "cost", result: "registered", better: "low" },
  costBooked: { label: "Cost / RDV", kind: "cost", result: "booked", better: "low" },
  margin: { label: "Margin vs break-even", kind: "money", better: "high", boardOnly: true },
  messages: { label: "Messages", kind: "count", better: "high" },
  spend: { label: "Amount spent", kind: "money", better: "none" },
};
const AB_RANKABLE = ["registered", "booked", "costRegistered", "costBooked", "margin"];
const AB_COLORS = ["#1877f2", "#e4572e", "#17a398", "#b8860b", "#8e44ad", "#d63384", "#2d3436", "#5b8c00"];
let abView = localStorage.getItem("cmcg-ab-view") === "graph" ? "graph" : "board";
let abRank = AB_RANKABLE.includes(localStorage.getItem("cmcg-ab-rank")) ? localStorage.getItem("cmcg-ab-rank") : "registered";
let abMetric = AB_METRICS[localStorage.getItem("cmcg-ab-metric")] && !AB_METRICS[localStorage.getItem("cmcg-ab-metric")].boardOnly ? localStorage.getItem("cmcg-ab-metric") : "registered";
let abChartType = localStorage.getItem("cmcg-ab-chart") === "bars" ? "bars" : "line";
let abCumulative = localStorage.getItem("cmcg-ab-cumulative") !== "0";
let abPeriod = { preset: "report", from: "", to: "", ...readStoredJson("cmcg-ab-period", {}) };
if (!AM_PRESETS.some(([key]) => key === abPeriod.preset)) abPeriod.preset = "report";
const abHidden = new Set();

function abSavePrefs() {
  try {
    localStorage.setItem("cmcg-ab-view", abView);
    localStorage.setItem("cmcg-ab-rank", abRank);
    localStorage.setItem("cmcg-ab-metric", abMetric);
    localStorage.setItem("cmcg-ab-chart", abChartType);
    localStorage.setItem("cmcg-ab-cumulative", abCumulative ? "1" : "0");
    localStorage.setItem("cmcg-ab-period", JSON.stringify(abPeriod));
  } catch {}
}

function abAgents() { return state.agents.filter((agent) => agent.active !== false); }
function abColor(agentId) { return AB_COLORS[Math.max(0, state.agents.findIndex((agent) => agent.id === agentId)) % AB_COLORS.length]; }

function abRows(range) {
  const breakEven = amBreakEven();
  const targets = CmcgProfit.derivedBreakEvens(amConversionTotals(), breakEven);
  const performance = performanceRows("agent", true, "quality", range);
  return abAgents().map((agent) => {
    const row = performance.find((item) => item.key === agent.id) || { ...emptyMetrics(), key: agent.id, name: agent.name };
    return {
      ...row,
      agent,
      name: agent.name,
      reg: CmcgProfit.verdict(row.spend, row.registered, breakEven),
      bookedVerdict: CmcgProfit.verdict(row.spend, row.booked, targets.booked),
      costRegistered: row.registered ? row.spend / row.registered : null,
      costBooked: row.booked ? row.spend / row.booked : null,
      margin: Number(row.registered || 0) * breakEven - Number(row.spend || 0),
      targets,
    };
  });
}

function abRankValue(row, key) {
  if (key === "costRegistered" || key === "costBooked") return row[key];
  if (key === "margin") return row.spend > 0 || row.registered > 0 ? row.margin : null;
  return Number(row[key] || 0);
}

function abSortRows(rows) {
  const better = AB_METRICS[abRank].better;
  return [...rows].sort((a, b) => {
    const left = abRankValue(a, abRank);
    const right = abRankValue(b, abRank);
    if (left === null || right === null) return left === right ? b.registered - a.registered : left === null ? 1 : -1;
    return (better === "low" ? left - right : right - left) || b.registered - a.registered || a.spend - b.spend;
  });
}

function abFormat(key, value) {
  if (value === null || value === undefined) return "—";
  const kind = AB_METRICS[key].kind;
  return kind === "count" ? number(value) : key === "margin" ? pfSignedMoney(value) : money(value);
}

function abBoardHtml(rows) {
  if (!rows.length) return '<p class="empty fbam-empty">Add agents to compare their results.</p>';
  const sorted = abSortRows(rows);
  const leaderValue = abRankValue(sorted[0], abRank);
  const maxRegistered = Math.max(1, ...rows.map((row) => row.registered));
  const maxBooked = Math.max(1, ...rows.map((row) => row.booked));
  const bar = (value, max, color) => `<span class="ab-bar"><span style="width:${((value / max) * 100).toFixed(1)}%;background:${color}"></span></span>`;
  const body = sorted.map((row, index) => {
    const value = abRankValue(row, abRank);
    const rank = value === null ? "—" : index + 1;
    const color = abColor(row.agent.id);
    let gap = "";
    if (index > 0 && value !== null && leaderValue !== null) {
      const diff = Math.abs(value - leaderValue);
      gap = AB_METRICS[abRank].kind === "count" ? `${number(diff)} behind #1` : `${money(diff)} ${AB_METRICS[abRank].better === "low" ? "more" : "less"} than #1`;
    }
    return `<tr class="ab-row pf-row-${row.reg.key}${rank === 1 ? " is-leader" : ""}">
      <td class="ab-rank-cell"><span class="ab-rank ab-rank-${rank}">${rank === 1 ? "🏆" : ""}${rank}</span></td>
      <td class="ab-agent-cell"><div class="ab-agent"><span class="ab-dot" style="background:${color}"></span><div><button class="fbam-agent-link" type="button" data-edit-agent="${escapeHtml(row.agent.id)}">${escapeHtml(row.name)}</button><small>${escapeHtml(gap || (rank === 1 ? "Leader" : ""))}</small></div></div></td>
      <td>${pfVerdictChip(row.reg)}</td>
      <td class="number-cell${abRank === "registered" ? " is-ranked" : ""}"><strong>${number(row.registered)}</strong>${bar(row.registered, maxRegistered, color)}</td>
      <td class="number-cell${abRank === "booked" ? " is-ranked" : ""}"><strong>${number(row.booked)}</strong>${bar(row.booked, maxBooked, color)}</td>
      <td class="number-cell${abRank === "costRegistered" ? " is-ranked" : ""}">${pfCostCell(row.reg)}</td>
      <td class="number-cell${abRank === "costBooked" ? " is-ranked" : ""}">${pfPill(row.bookedVerdict, row.targets.booked, "RDV")}</td>
      <td class="number-cell${abRank === "margin" ? " is-ranked" : ""}">${row.reg.key === "idle" ? '<span class="pf-dash">—</span>' : `<strong class="pf-margin ${row.margin >= 0 ? "is-positive" : "is-negative"}">${pfSignedMoney(row.margin)}</strong>`}</td>
      <td class="number-cell">${number(row.messages)}</td>
      <td class="number-cell">${money(row.spend)}</td>
      <td>${agentClosingBadge(row)}</td>
    </tr>`;
  }).join("");
  const head = ["#", "Agent", "Verdict", "Registered", "RDV", "Cost / registration", "Cost / RDV", "Margin vs break-even", "Messages", "Amount spent", "Closing"];
  const keys = [null, null, null, "registered", "booked", "costRegistered", "costBooked", "margin", null, null, null];
  return `<div class="fbam-grid"><table class="fbam-table ab-table"><thead><tr>${head.map((label, index) => keys[index] ? `<th class="number-cell" aria-sort="${abRank === keys[index] ? (AB_METRICS[keys[index]].better === "low" ? "ascending" : "descending") : "none"}"><button class="fbam-sort${abRank === keys[index] ? " active" : ""}" type="button" data-ab-rank="${keys[index]}"><span>${escapeHtml(label)}</span><span class="fbam-sort-arrow" aria-hidden="true">${AB_METRICS[keys[index]].better === "low" ? "▲" : "▼"}</span></button></th>` : `<th><span class="ab-th">${escapeHtml(label)}</span></th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Per-agent daily spend/messages/RDV/registrations inside the range.
function abDaily(range) {
  const buckets = new Map();
  const add = (agentId, date, field, value) => {
    if (!agentId || !date) return;
    if (!buckets.has(agentId)) buckets.set(agentId, new Map());
    const days = buckets.get(agentId);
    if (!days.has(date)) days.set(date, { spend: 0, messages: 0, booked: 0, registered: 0 });
    days.get(date)[field] += value;
  };
  filteredLogs(range).forEach((log) => {
    const agentId = relationForLog(log).agent?.id;
    const date = dateOnly(log.reportingEnd || log.date || log.reportingStart);
    add(agentId, date, "spend", Number(log.spend || 0));
    add(agentId, date, "messages", Number(log.messages || 0));
  });
  filteredOutcomes(range).forEach((outcome) => {
    if (outcome.type === "booked" || outcome.type === "registered") add(outcome.agentId, dateOnly(outcome.sourceDate || outcome.date), outcome.type, 1);
  });
  return buckets;
}

function abChartRange(range) {
  const to = range.to || dateInputValue(new Date());
  if (range.from) return { from: range.from, to };
  const first = state.dailyLogs.reduce((min, log) => { const date = dateOnly(log.reportingStart || log.date); return date && (!min || date < min) ? date : min; }, "");
  return { from: first || dateInputValue(addDays(new Date(), -29)), to };
}

// One value per bucket per agent; cumulative mode draws the running trajectory.
function abSeries(daily, agentId, buckets) {
  const days = daily.get(agentId) || new Map();
  const metric = AB_METRICS[abMetric];
  let spend = 0;
  let total = 0;
  return buckets.map((bucket) => {
    const sums = bucket.days.reduce((acc, date) => {
      const day = days.get(date);
      if (day) Object.keys(acc).forEach((key) => { acc[key] += day[key]; });
      return acc;
    }, { spend: 0, messages: 0, booked: 0, registered: 0 });
    if (metric.kind === "cost") {
      spend = abCumulative ? spend + sums.spend : sums.spend;
      total = abCumulative ? total + sums[metric.result] : sums[metric.result];
      return total ? spend / total : null;
    }
    const value = sums[abMetric];
    total = abCumulative ? total + value : value;
    return total;
  });
}

function abBuckets(range) {
  const days = eachDay(range.from, range.to);
  const size = days.length > 45 ? 7 : 1;
  const buckets = [];
  for (let index = 0; index < days.length; index += size) buckets.push({ from: days[index], days: days.slice(index, index + size) });
  return { buckets, weekly: size === 7 };
}

function abChartSvg(series, buckets, target) {
  const width = 960;
  const height = 320;
  const left = 70;
  const right = 120;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const count = buckets.length;
  const metric = AB_METRICS[abMetric];
  const format = (value) => (metric.kind === "count" ? number(value) : money(value));
  const values = series.flatMap((item) => item.values).filter((value) => Number.isFinite(value));
  const max = axisTop(Math.max(0, ...values), target || 0);
  const x = (index) => left + (count <= 1 ? plotWidth / 2 : (index * plotWidth) / (count - 1));
  const y = (value) => top + plotHeight * (1 - Math.min(value, max) / max);
  const grid = axisTicks(max, target || 0).map((value) => `<line class="pf-grid" x1="${left}" x2="${width - right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text class="pf-axis" x="${left - 8}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(format(value))}</text>`).join("");
  const targetLine = target ? `<rect class="pf-zone-bad" x="${left}" y="${top}" width="${plotWidth}" height="${Math.max(0, y(target) - top).toFixed(1)}"/><rect class="pf-zone-good" x="${left}" y="${y(target).toFixed(1)}" width="${plotWidth}" height="${Math.max(0, top + plotHeight - y(target)).toFixed(1)}"/><line class="pf-be-line" x1="${left}" x2="${width - right}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/><text class="pf-be-label" x="${left + 6}" y="${(y(target) - 6).toFixed(1)}">Break-even ${escapeHtml(money(target))}</text>` : "";
  const step = Math.max(1, Math.ceil(count / 7));
  const xLabels = buckets.map((bucket, index) => ((index % step === 0 && count - 1 - index >= step / 2) || index === count - 1) ? `<text class="pf-axis" x="${x(index).toFixed(1)}" y="${height - 12}" text-anchor="middle">${escapeHtml(pfShortDate(bucket.from))}</text>` : "").join("");
  let marks = "";
  if (abChartType === "bars") {
    const slot = plotWidth / Math.max(1, count);
    const barWidth = Math.max(2, Math.min(22, (slot * 0.8) / Math.max(1, series.length)));
    series.forEach((item, seriesIndex) => {
      item.values.forEach((value, index) => {
        if (!Number.isFinite(value) || value <= 0) return;
        const xPos = x(index) - (barWidth * series.length) / 2 + barWidth * seriesIndex; // grouped around the date
        marks += `<rect class="ab-bar-mark" x="${xPos.toFixed(1)}" y="${y(value).toFixed(1)}" width="${(barWidth - 1).toFixed(1)}" height="${(top + plotHeight - y(value)).toFixed(1)}" fill="${item.color}"><title>${escapeHtml(`${item.name} · ${buckets[index].from}: ${format(value)}`)}</title></rect>`;
      });
    });
  } else {
    series.forEach((item) => {
      let path = "";
      let pen = false;
      item.values.forEach((value, index) => {
        if (!Number.isFinite(value)) { pen = false; return; }
        path += `${pen ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
        pen = true;
      });
      const dots = item.values.map((value, index) => Number.isFinite(value) ? `<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="${count > 40 ? 2 : 3}" fill="${item.color}"><title>${escapeHtml(`${item.name} · ${buckets[index].from}: ${format(value)}`)}</title></circle>` : "").join("");
      marks += `<path class="ab-line" d="${path}" stroke="${item.color}"/>${dots}`;
    });
  }
  // End labels, nudged apart so they never overlap.
  const labels = series.map((item) => {
    const last = item.values.map((value, index) => [value, index]).filter(([value]) => Number.isFinite(value)).pop();
    return last ? { item, value: last[0], y: y(last[0]) } : null;
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  labels.forEach((label, index) => { if (index && label.y - labels[index - 1].y < 15) label.y = labels[index - 1].y + 15; });
  const endLabels = labels.map((label) => `<text class="ab-end-label" x="${width - right + 8}" y="${(label.y + 4).toFixed(1)}" fill="${label.item.color}">${escapeHtml(label.item.name)} · ${escapeHtml(format(label.value))}</text>`).join("");
  const empty = !values.length ? `<text class="pf-empty-text" x="${left + plotWidth / 2}" y="${top + plotHeight / 2}" text-anchor="middle">No data in this period</text>` : "";
  return `<svg class="ab-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)}">${targetLine}${grid}${marks}${xLabels}${endLabels}${empty}</svg>`;
}

function abGraphHtml(rows, range) {
  const chartRange = abChartRange(range);
  const { buckets, weekly } = abBuckets(chartRange);
  const daily = abDaily(chartRange);
  const visible = rows.filter((row) => !abHidden.has(row.agent.id));
  const totals = amTotals(visible);
  const targets = rows[0]?.targets || CmcgProfit.derivedBreakEvens(amConversionTotals(), amBreakEven());
  const cards = Object.entries(AB_METRICS).filter(([, metric]) => !metric.boardOnly).map(([key, metric]) => {
    const value = metric.kind === "cost" ? (totals[metric.result] ? totals.spend / totals[metric.result] : null) : totals[key];
    const target = key === "costRegistered" ? amBreakEven() : key === "costBooked" ? targets.booked : null;
    const verdict = metric.kind === "cost" && target ? CmcgProfit.verdict(totals.spend, totals[metric.result], target) : null;
    return `<button class="ab-card${abMetric === key ? " is-active" : ""}${verdict ? ` pf-${verdict.key}` : ""}" type="button" data-ab-metric="${key}" aria-pressed="${abMetric === key}"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(abFormat(key, value))}</strong>${target ? `<small><span>break-even</span> ${escapeHtml(money(target))}</small>` : ""}</button>`;
  }).join("");
  const chips = rows.map((row) => `<button class="ab-agent-chip${abHidden.has(row.agent.id) ? " is-off" : ""}" type="button" data-ab-agent="${escapeHtml(row.agent.id)}" aria-pressed="${!abHidden.has(row.agent.id)}"><i style="background:${abColor(row.agent.id)}"></i>${escapeHtml(row.name)}</button>`).join("");
  const series = visible.map((row) => ({ name: row.name, color: abColor(row.agent.id), values: abSeries(daily, row.agent.id, buckets) }));
  const target = abMetric === "costRegistered" ? amBreakEven() : abMetric === "costBooked" ? targets.booked : null;
  const metric = AB_METRICS[abMetric];
  const note = `${abCumulative ? (metric.kind === "cost" ? "Running cost since the start of the period" : "Running total since the start of the period") : (metric.kind === "cost" ? "Cost inside each" : "Total inside each")} ${abCumulative ? "" : (weekly ? "week" : "day")}`.trim();
  return `<div class="ab-cards">${cards}</div>
    <div class="ab-graph-controls">
      <div class="ab-agent-chips"><button class="ab-agent-chip ab-all" type="button" data-ab-agent="">All agents</button>${chips}</div>
      <div class="ab-toggles"><div class="fbam-mode" role="group" aria-label="Chart type"><button type="button" class="${abChartType === "line" ? "active" : ""}" data-ab-chart="line">Line</button><button type="button" class="${abChartType === "bars" ? "active" : ""}" data-ab-chart="bars">Bars</button></div><div class="fbam-mode" role="group" aria-label="Values"><button type="button" class="${abCumulative ? "active" : ""}" data-ab-cumulative="1">Trajectory</button><button type="button" class="${abCumulative ? "" : "active"}" data-ab-cumulative="0">Per ${weekly ? "week" : "day"}</button></div></div>
    </div>
    <div class="ab-chart-wrap">${abChartSvg(series, buckets, target)}</div>
    <p class="pf-chart-legend"><span>${escapeHtml(metric.label)}</span><span>${escapeHtml(note)}</span>${target ? '<span><i class="pf-lg-be"></i>Break-even</span>' : ""}</p>`;
}

function renderAgentBoard() {
  const root = document.getElementById("agentBoard");
  if (!root || !state) return;
  if (!root.dataset.ready) {
    root.innerHTML = `<div class="fbam-toolbar"><div class="fbam-mode" role="tablist" aria-label="View"><button type="button" role="tab" data-ab-view="board"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h10v3h4v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 16.9V19h4v2H7v-2h4v-2.1A5 5 0 0 1 8.3 14H8a5 5 0 0 1-5-5V6h4V3Zm0 5H5v1a3 3 0 0 0 2 2.8V8Zm10 3.8A3 3 0 0 0 19 9V8h-2v3.8Z"/></svg><span>Leaderboard</span></button><button type="button" role="tab" data-ab-view="graph"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19h16v2H2V3h2v16Zm3-3-1.5-1.3 4.2-4.8 3.1 2.7L18 6.7 19.5 8l-6.6 7.6-3-2.6L7 16Z"/></svg><span>Graphs</span></button></div><div class="ab-period"><label><span class="sr-only">Period</span><select data-ab-preset>${AM_PRESETS.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("")}</select></label><label class="ab-custom"><span class="sr-only">From</span><input type="date" data-ab-date="from" /></label><label class="ab-custom"><span class="sr-only">To</span><input type="date" data-ab-date="to" /></label><span class="ab-range" data-ab-range></span></div></div><div class="ab-body" data-ab-body></div>`;
    root.dataset.ready = "1";
    root.addEventListener("click", handleAgentBoardClick);
    root.addEventListener("change", handleAgentBoardChange);
  }
  const range = amClampRange(amPresetRange(abPeriod.preset, abPeriod));
  root.querySelectorAll("[data-ab-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.abView === abView);
    button.setAttribute("aria-selected", String(button.dataset.abView === abView));
  });
  root.querySelector("[data-ab-preset]").value = abPeriod.preset;
  root.querySelectorAll(".ab-custom").forEach((label) => label.classList.toggle("hidden", abPeriod.preset !== "custom"));
  root.querySelector('[data-ab-date="from"]').value = abPeriod.from || "";
  root.querySelector('[data-ab-date="to"]').value = abPeriod.to || "";
  root.querySelector("[data-ab-range]").textContent = amRangeText(range);
  const rows = abRows(range);
  const rankChips = `<div class="ab-rank-by"><span>Rank by</span>${AB_RANKABLE.map((key) => `<button type="button" class="pf-chip${abRank === key ? " is-active ab-rank-active" : ""}" data-ab-rank="${key}" aria-pressed="${abRank === key}">${escapeHtml(AB_METRICS[key].label)}</button>`).join("")}</div>`;
  root.querySelector("[data-ab-body]").innerHTML = abView === "graph" ? abGraphHtml(rows, range) : rankChips + abBoardHtml(rows);
  applyLanguage(root);
}

function handleAgentBoardClick(event) {
  const view = event.target.closest("[data-ab-view]");
  const rank = event.target.closest("[data-ab-rank]");
  const metric = event.target.closest("[data-ab-metric]");
  const agent = event.target.closest("[data-ab-agent]");
  const chart = event.target.closest("[data-ab-chart]");
  const cumulative = event.target.closest("[data-ab-cumulative]");
  if (view) abView = view.dataset.abView === "graph" ? "graph" : "board";
  else if (rank) abRank = rank.dataset.abRank;
  else if (metric) abMetric = metric.dataset.abMetric;
  else if (chart) abChartType = chart.dataset.abChart;
  else if (cumulative) abCumulative = cumulative.dataset.abCumulative === "1";
  else if (agent) {
    const id = agent.dataset.abAgent;
    if (!id) abHidden.clear();
    else if (abHidden.has(id)) abHidden.delete(id);
    else if (abAgents().length - abHidden.size > 1) abHidden.add(id);
  } else return;
  abSavePrefs();
  renderAgentBoard();
}

function handleAgentBoardChange(event) {
  const preset = event.target.closest("[data-ab-preset]");
  const date = event.target.closest("[data-ab-date]");
  if (preset) {
    abPeriod.preset = preset.value;
    if (preset.value === "custom" && !abPeriod.from) Object.assign(abPeriod, amPresetRange("last30"));
  } else if (date) {
    abPeriod[date.dataset.abDate] = date.value;
    abPeriod.preset = "custom";
  } else return;
  abSavePrefs();
  renderAgentBoard();
}

function renderOverviewTables() {
  renderAdsManager();
  renderAgentBoard();
}

function entityCell(row, type = groupBy) {
  const relation = row.relation;
  let context = "";
  if (type === "ad") context = [relation.adSet?.name, relation.campaign?.name].filter(Boolean).join(" · ");
  if (type === "adSet") context = relation.campaign?.name || "";
  if (type === "campaign") context = relation.objective || "";
  if (type === "agent") context = row.key === "__unassigned" ? "Create a matching agent" : "Matched from ad set names";
  return `<div class="entity-cell"><strong>${escapeHtml(row.name)}</strong>${context ? `<small>${escapeHtml(context)}</small>` : ""}</div>`;
}

function cellValue(column, row) {
  const relation = row.relation || {};
  const latest = row.latestLog || {};
  const values = {
    entity: entityCell(row),
    quality: qualityBadge(row),
    status: statusPill(row),
    agentClosing: groupBy === "agent" ? agentClosingBadge(row) : "-",
    collected: money(row.collected || 0),
    potential: money(row.potential || 0),
    roi: roiCell(row.spend, row.collected, row.roiNet),
    potentialRoi: roiCell(row.spend, row.potential, row.potentialRoiNet),
    agent: escapeHtml(relation.agent?.name || (groupBy === "agent" ? row.name : "Unassigned")),
    objective: escapeHtml(relation.objective || relation.adSet?.objective || relation.campaign?.objective || "—"),
    spend: money(row.spend), messages: number(row.messages), booked: row.booked, visits: row.visits, showed: row.showed, registered: `<strong>${row.registered}</strong>`,
    costBooked: cost(row.spend, row.booked), costVisit: cost(row.spend, row.visits), costShowed: cost(row.spend, row.showed), costRegistered: cost(row.spend, row.registered),
    showRate: percent(row.showRate), closeRate: percent(row.closeRate),
    campaign: escapeHtml(relation.campaign?.name || (groupBy === "campaign" ? row.name : "—")),
    adSet: escapeHtml(relation.adSet?.name || (groupBy === "adSet" ? row.name : "—")),
    code: relation.ad?.code ? `<span class="code">${escapeHtml(relation.ad.code)}</span>` : "—",
    delivery: escapeHtml(relation.ad?.deliveryStatus || relation.adSet?.deliveryStatus || relation.campaign?.deliveryStatus || "—"),
    deliveryLevel: escapeHtml(relation.ad?.deliveryLevel || latest.raw?.["Delivery level"] || "—"),
    resultType: escapeHtml(latest.resultType || "—"), results: number(row.results), costPerResult: cost(row.spend, row.results), messagesReplied: number(row.messagesReplied),
    impressions: number(row.impressions), reach: number(row.reach), frequency: row.reach ? number(row.impressions / row.reach) : "—",
    linkClicks: number(row.linkClicks), shopClicks: number(row.shopClicks), clicksAll: number(row.clicksAll), ctr: row.impressions ? `${number((row.linkClicks / row.impressions) * 100)}%` : "—",
    cpc: row.linkClicks ? money(row.spend / row.linkClicks) : "—", ctrAll: row.impressions ? `${number((row.clicksAll / row.impressions) * 100)}%` : "—", cpcAll: row.clicksAll ? money(row.spend / row.clicksAll) : "—",
    cpm: row.impressions ? money((row.spend / row.impressions) * 1000) : "—", landingPageViews: number(row.landingPageViews), costLandingPageView: cost(row.spend, row.landingPageViews),
    qualityRanking: escapeHtml(latest.qualityRanking || "—"), engagementRanking: escapeHtml(latest.engagementRanking || "—"), conversionRanking: escapeHtml(latest.conversionRanking || "—"),
    reportingStart: escapeHtml(latest.reportingStart || latest.date || "—"), reportingEnd: escapeHtml(latest.reportingEnd || latest.date || "—"),
    account: escapeHtml(relation.account?.name || "—"), accountId: escapeHtml(relation.account?.metaAccountId || "—"),
    campaignId: escapeHtml(relation.campaign?.metaCampaignId || "—"), adSetId: escapeHtml(relation.adSet?.metaAdSetId || "—"), adId: escapeHtml(relation.ad?.metaAdId || "—"),
    pageId: escapeHtml(relation.ad?.pageId || "—"),
    action: addOutcomeButton(groupBy, row.targetId, row.name),
  };
  return values[column.key] ?? escapeHtml(latest[column.key] || "—");
}

function renderColumnOptions() {
  document.getElementById("columnOptions").innerHTML = columnDefinitions.filter((column) => !column.required).map((column) => `<label><input type="checkbox" data-column="${column.key}" ${visibleColumns.has(column.key) ? "checked" : ""} /><span>${escapeHtml(column.label)}</span></label>`).join("");
}

function renderPerformance() {
  const rows = performanceRows();
  const agentColumns = new Set(["agentClosing", "showRate", "closeRate", "collected", "roi", "potential", "potentialRoi"]);
  const agentOnlyColumns = new Set(["agentClosing", "collected", "roi", "potential", "potentialRoi"]);
  const columns = columnDefinitions.filter((column) => {
    if (groupBy !== "agent" && agentOnlyColumns.has(column.key)) return false;
    return visibleColumns.has(column.key) || (groupBy === "agent" && agentColumns.has(column.key));
  });
  document.getElementById("performanceCount").textContent = `${rows.length} ${groupBy === "ad" ? "ads" : groupBy === "adSet" ? "ad sets" : groupBy === "campaign" ? "campaigns" : "agents"}`;
  document.getElementById("performanceTable").innerHTML = `<table><thead><tr>${columns.map((column) => `<th class="${column.numeric ? "number-cell" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr class="${qualityRowClass(row)}">${columns.map((column) => `<td class="${column.numeric ? "number-cell" : ""}">${cellValue(column, row)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}" class="empty">No performance matches these filters.</td></tr>`}</tbody></table>`;
  renderColumnOptions();
}

function outcomeSource(outcome) {
  const relation = relationForOutcome(outcome);
  if (outcome.assignmentLevel === "ad") return { name: relation.ad?.name || "Unknown ad", detail: relation.adSet?.name || "Ad" };
  if (outcome.assignmentLevel === "adSet") return { name: relation.adSet?.name || "Unknown ad set", detail: relation.campaign?.name || "Ad set" };
  if (outcome.assignmentLevel === "campaign") return { name: relation.campaign?.name || "Unknown campaign", detail: "Campaign" };
  return { name: relation.agent?.name || "Unknown agent", detail: "Agent" };
}

function visibleOutcomes() {
  const query = document.getElementById("outcomeSearch").value.trim().toLocaleLowerCase();
  const type = document.getElementById("outcomeTypeFilter").value;
  return [...state.outcomes].filter((outcome) => {
    const source = outcomeSource(outcome);
    const relation = relationForOutcome(outcome);
    const haystack = [outcome.personName, outcome.phone, outcome.notes, source.name, relation.agent?.name].join(" ").toLocaleLowerCase();
    return overlapsRange(outcome.sourceDate || outcome.date, outcome.date) && (!type || outcome.type === type) && (!query || haystack.includes(query));
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function renderOutcomes() {
  const outcomes = visibleOutcomes();
  document.getElementById("outcomeCount").textContent = `${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"}`;
  document.getElementById("outcomeRows").innerHTML = outcomes.length ? outcomes.map((outcome) => {
    const meta = outcomeMeta[outcome.type] || { label: outcome.type, className: "" };
    const source = outcomeSource(outcome);
    const agent = relationForOutcome(outcome).agent;
    return `<tr><td>${escapeHtml(outcome.date)}</td><td><span class="outcome-pill ${meta.className}">${escapeHtml(meta.label)}</span></td><td><div class="entity-cell"><strong>${escapeHtml(outcome.personName || "Not entered")}</strong><small>${escapeHtml(outcome.phone || "No phone")}</small></div></td><td><div class="entity-cell"><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></td><td>${escapeHtml(agent?.name || "—")}</td><td>${escapeHtml(outcome.notes || "—")}</td><td><button class="delete-button" type="button" data-delete-outcome="${escapeHtml(outcome.id)}" aria-label="Delete outcome" title="Delete"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7ZM9 9v8h2V9H9Zm4 0v8h2V9h-2ZM8 3h8l1 1h4v2H3V4h4l1-1Z"/></svg></button></td></tr>`;
  }).join("") : '<tr><td colspan="7" class="empty">No outcomes recorded yet. Use “Add outcome” to begin.</td></tr>';
}

function renderAgents() {
  const rows = performanceRows("agent", true);
  document.getElementById("agentDirectorySummary").textContent = `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"} · names match case-insensitively`;
  document.getElementById("agentCards").innerHTML = state.agents.length ? state.agents.map((agent) => {
    const adSets = state.adSets.filter((adSet) => adSet.agentId === agent.id);
    const metrics = rows.find((row) => row.key === agent.id) || emptyMetrics();
    return `<article class="card agent-card"><div class="agent-avatar" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</div><div class="agent-main"><strong>${escapeHtml(agent.name)}${agent.active === false ? ' <span class="status-pill">Inactive</span>' : ""}</strong><small>${escapeHtml(agent.whatsapp || "No WhatsApp number")}</small>${agent.aliases?.length ? `<small class="agent-aliases"><span>Also:</span> ${escapeHtml(agent.aliases.join(", "))}</small>` : ""}</div><div class="agent-stat"><strong>${adSets.length}</strong><span>matched ad sets</span></div><div class="agent-stat"><strong>${metrics.registered || 0}</strong><span>registrations</span></div><div class="agent-stat closing-stat">${agentClosingBadge(metrics)}</div><div class="agent-actions"><button class="row-add" type="button" data-add-outcome data-level="agent" data-target="${escapeHtml(agent.id)}" aria-label="Add outcome for ${escapeHtml(agent.name)}">+</button><button class="icon-button small" type="button" data-edit-agent="${escapeHtml(agent.id)}" aria-label="Edit ${escapeHtml(agent.name)}" title="Edit agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16.6 10.9-10.9 2.4 2.4L7.4 19H5v-2.4ZM17.1 4.5l1.1-1.1c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2l-1.1 1.1-2.4-2.4Z"/></svg></button><button class="delete-button small" type="button" data-delete-agent="${escapeHtml(agent.id)}" aria-label="Delete ${escapeHtml(agent.name)}" title="Delete agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7ZM9 9v8h2V9H9Zm4 0v8h2V9h-2ZM8 3h8l1 1h4v2H3V4h4l1-1Z"/></svg></button></div></article>`;
  }).join("") : '<div class="empty card">Add your first sales agent. Existing imported ad sets will be matched immediately.</div>';
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  document.getElementById("unassignedAdSets").innerHTML = unassigned.length ? unassigned.map((adSet) => `<div class="simple-list-row"><div><strong>${escapeHtml(adSet.name)}</strong><small>${escapeHtml(byId(state.campaigns, adSet.campaignId)?.name || "Unknown campaign")}</small></div><span class="status-pill ${adSet.agentMatchStatus === "ambiguous" ? "warning" : ""}">${adSet.agentMatchStatus === "ambiguous" ? "Multiple names found" : adSet.agentMatchHint ? `"${escapeHtml(adSet.agentMatchHint)}" is not an agent yet` : "No matching agent"}</span></div>`).join("") : '<div class="empty success-empty">All imported ad sets are assigned.</div>';
}

// ---- Detailed per-agent report ----
let reportAgentId = localStorage.getItem("cmcg-report-agent") || "";
function reportKpi(label, value, detail, tone = "neutral") {
  return `<article class="kpi ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}
function renderReport() {
  const select = document.getElementById("reportAgent");
  const body = document.getElementById("reportBody");
  if (!select || !body) return;
  // Hydrate the agent picker.
  const current = reportAgentId;
  select.replaceChildren(option("Choisir un agent…", ""));
  state.agents.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => select.append(option(a.name, a.id)));
  if (state.agents.some((a) => a.id === current)) select.value = current;
  else if (state.agents[0]) { reportAgentId = state.agents[0].id; select.value = reportAgentId; }

  const agent = byId(state.agents, reportAgentId);
  if (!agent) {
    body.innerHTML = '<div class="empty card">Ajoutez un agent, puis choisissez-le pour voir son rapport détaillé.</div>';
    applyLanguage(body);
    return;
  }

  // Ad results + ROI + closing come from the agent row of the performance engine (period-aware).
  const row = performanceRows("agent", true).find((r) => r.key === agent.id) || { ...emptyMetrics(), ...agentRevenue(agent.id, true) };
  const students = state.students.filter((s) => s.agentId === agent.id);
  const activeStudents = students.filter((s) => s.status !== "cancelled");
  const collected = row.collected ?? agentRevenue(agent.id, true).collected;
  const potential = row.potential ?? agentRevenue(agent.id, true).potential;
  const roi = row.spend > 0 ? collected / row.spend : 0;
  const potentialRoi = row.spend > 0 ? potential / row.spend : 0;
  const closing = agentClosingBadge(row);

  const header = `<div class="report-header"><div class="agent-avatar big" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</div><div><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.whatsapp || "Sans WhatsApp")} · période ${escapeHtml(filters.from || "début")} → ${escapeHtml(filters.to || "aujourd'hui")}</p></div></div>`;

  const adKpis = `<div class="report-section"><h4>Publicité & ROI</h4><div class="kpis report-kpis">
    ${reportKpi("Dépense", money(row.spend || 0), "sur la période", "neutral")}
    ${reportKpi("Messages", number(row.messages || 0), cost(row.spend, row.messages) + " chacun", "blue")}
    ${reportKpi("Rendez-vous", number(row.booked || 0), cost(row.spend, row.booked) + " chacun", "amber")}
    ${reportKpi("Visites", number(row.visits || 0), `${row.showed || 0} sans inscription`, "violet")}
    ${reportKpi("Inscrits", number(row.registered || 0), cost(row.spend, row.registered) + " chacun", "green")}
    ${reportKpi("Encaissé", money(collected), "des étudiants de l'agent", "green")}
    ${reportKpi("ROI", row.spend > 0 ? `${number(roi)}×` : "—", `net ${money(collected - (row.spend || 0))}`, collected - (row.spend || 0) >= 0 ? "green" : "red")}
    ${reportKpi("ROI potentiel", row.spend > 0 ? `${number(potentialRoi)}×` : "—", `si tout payé · ${money(potential)}`, "violet")}
  </div></div>`;

  const closingKpis = `<div class="report-section"><h4>Qualité de closing</h4><div class="kpis report-kpis">
    ${reportKpi("Taux de présence", percent(row.showRate), "des rendez-vous venus", "blue")}
    ${reportKpi("Taux de conversion", percent(row.closeRate), "visites → inscriptions", "green")}
    <article class="kpi closing-kpi"><span>Score closing</span><div>${closing}</div></article>
  </div></div>`;

  const remaining = activeStudents.reduce((sum, s) => sum + studentRemaining(s), 0);
  const studentRows = students.slice().sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt))).map((student) => {
    const paid = studentPaid(student); const total = Number(student.totalDue || 0);
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (paid > 0 ? 100 : 0);
    const due = paymentDueStatus(student);
    return `<tr data-student-detail="${escapeHtml(student.id)}" class="clickable-row"><td><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(studentTraining(student)?.name || "")} · ${escapeHtml(studentGroup(student)?.name || "")}</small></td><td>${escapeHtml({ registered: "Inscrit", active: "Actif", paused: "Pause", completed: "Terminé", cancelled: "Annulé" }[student.status] || student.status)}</td><td class="number-cell">${money(paid)} / ${money(total)}<div class="mini-progress"><i style="width:${pct}%"></i></div></td><td class="number-cell"><strong>${money(studentRemaining(student))}</strong></td><td><span class="status-pill ${due.className}">${escapeHtml(due.label)}</span></td></tr>`;
  }).join("");
  const studentsSection = `<div class="report-section"><h4>Étudiants de l'agent (${number(students.length)}) · reste ${money(remaining)}</h4><div class="table-wrap flat"><table><thead><tr><th>Étudiant</th><th>Statut</th><th>Payé</th><th>Reste</th><th>Paiement</th></tr></thead><tbody>${studentRows || '<tr><td colspan="5" class="empty">Aucun étudiant pour cet agent.</td></tr>'}</tbody></table></div></div>`;

  body.innerHTML = `${header}${adKpis}${closingKpis}${studentsSection}`;
  applyLanguage(body);
}

function groupTraining(group) { return byId(state.programs, group?.programId); }
function studentGroup(student) { return byId(state.groups, student?.groupId); }
function studentTraining(student) { return groupTraining(studentGroup(student)); }
function studentPaid(student) { return state.payments.filter((payment) => payment.studentId === student?.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0); }
function studentRemaining(student) { return Math.max(0, Number(student?.totalDue || 0) - studentPaid(student)); }
function parseInputDate(value) {
  const text = String(value || "").slice(0, 10);
  const date = text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
function addMonthsInput(value, months = 1) {
  const date = parseInputDate(value);
  if (!date) return "";
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== originalDay) date.setDate(0);
  return date.toISOString().slice(0, 10);
}
function daysUntil(value) {
  const date = parseInputDate(value);
  if (!date) return null;
  const today = parseInputDate(todayInput());
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
function normalizePaymentPlanUi(value) {
  const text = String(value || "").toLocaleLowerCase();
  if (text === "full" || text === "cash" || text === "paid-full") return "paid_full";
  if (text === "installments" || text === "installment") return "monthly";
  return ["paid_full", "monthly", "custom"].includes(text) ? text : "paid_full";
}
function durationMonthsFor(group) {
  const training = groupTraining(group);
  if (training?.durationMonths) return Math.max(1, Number(training.durationMonths));
  const raw = [group?.durationLabel, training?.durationLabel].filter(Boolean).join(" ");
  const match = String(raw).match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 0;
}
// Price mapping: monthly plan -> training.monthlyPrice (main), cash/full plan -> discountedPrice (cash), fallback to fullPrice.
function trainingMonthlyPrice(training) {
  return Number(training?.monthlyPrice || training?.basePrice || training?.fullPrice || training?.discountedPrice || 0);
}
function trainingCashPrice(training) {
  return Number(training?.discountedPrice || training?.fullPrice || training?.basePrice || training?.monthlyPrice || 0);
}
function groupCashPrice(group) {
  const training = groupTraining(group);
  return Number(group?.discountedPrice || trainingCashPrice(training) || group?.price || 0);
}
function groupRegularPrice(group) {
  const training = groupTraining(group);
  return Number(group?.price || trainingMonthlyPrice(training) || group?.discountedPrice || 0);
}
function defaultPriceForPlan(group, plan) {
  if (!group) return 0;
  const training = groupTraining(group);
  const normalized = normalizePaymentPlanUi(plan);
  if (normalized === "monthly") return Number(group?.price || trainingMonthlyPrice(training) || 0);
  // paid_full / custom default to the cash (discounted) price
  return Number(group?.discountedPrice || trainingCashPrice(training) || group?.price || 0);
}
function paymentPlanLabel(student) {
  const plan = normalizePaymentPlanUi(student?.paymentPlan);
  if (plan === "monthly") return "Monthly payments";
  if (plan === "custom") return "Custom agreement";
  return "Paid full / cash";
}
function paymentDueStatus(student) {
  const remaining = studentRemaining(student);
  if (remaining <= 0) return { key: "paid", label: "Paid full", className: "quality-strong", detail: "No remaining balance" };
  const paid = studentPaid(student);
  const dueIn = daysUntil(student?.nextPaymentDate);
  if (dueIn !== null && dueIn < 0) return { key: "overdue", label: "Overdue payment", className: "quality-weak", detail: `${Math.abs(dueIn)} days late` };
  if (dueIn === 0) return { key: "due", label: "Due today", className: "quality-watch", detail: "Collect today" };
  if (dueIn !== null && dueIn <= 7) return { key: "due_soon", label: "Due soon", className: "quality-watch", detail: `Due in ${dueIn} days` };
  if (dueIn !== null) return { key: "scheduled", label: "Next payment scheduled", className: "quality-pending", detail: `Next: ${student.nextPaymentDate}` };
  return paid > 0
    ? { key: "balance", label: "Flexible balance", className: "quality-watch", detail: "No next date set" }
    : { key: "none", label: "No payment yet", className: "quality-weak", detail: "Collect first payment" };
}
function paymentAgreementSummary(student) {
  const parts = [paymentPlanLabel(student)];
  if (student?.installmentAmount) parts.push(`${money(student.installmentAmount)} each month`);
  if (student?.installmentsCount) parts.push(`${number(student.installmentsCount)} payments`);
  if (student?.nextPaymentDate && studentRemaining(student) > 0) parts.push(`Next: ${student.nextPaymentDate}`);
  return parts.join(" · ");
}
function simpleDay(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}
function normalizeDayKey(value) {
  const simple = simpleDay(value);
  const direct = WEEK_DAYS.find((day) => day.key === simple || simpleDay(day.label) === simple);
  if (direct) return direct.key;
  const found = Object.entries(DAY_ALIASES).find(([, aliases]) => aliases.some((alias) => simpleDay(alias) === simple));
  return found?.[0] || simple;
}
function dayLabel(value) {
  const key = normalizeDayKey(value);
  return WEEK_DAYS.find((day) => day.key === key)?.label || String(value || "");
}
function groupSessions(group) {
  return Array.isArray(group?.sessions) ? group.sessions : [];
}
function groupSchedule(group) {
  const sessions = groupSessions(group);
  if (!sessions.length) return "Aucune séance planifiée";
  // Group sessions that share the same time range so "Mon, Wed 09:00-11:00" reads cleanly.
  const byTime = new Map();
  sessions.forEach((session) => {
    const key = `${session.timeStart}-${session.timeEnd}`;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(session.day);
  });
  return [...byTime.entries()]
    .map(([time, days]) => `${days.map(dayLabel).join(", ")} ${time}`)
    .join(" · ");
}
function groupTimeKeys(group) {
  return [...new Set(groupSessions(group).map((session) => `${session.timeStart}-${session.timeEnd}`))];
}
function minutesForTime(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}
function timeRangesOverlap(startA, endA, startB, endB) {
  const aStart = minutesForTime(startA);
  const aEnd = minutesForTime(endA);
  const bStart = minutesForTime(startB);
  const bEnd = minutesForTime(endB);
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false;
  return aStart < bEnd && bStart < aEnd;
}
function dayNames(value) {
  return String(value || "").split(",").map((item) => dayLabel(item.trim())).filter(Boolean);
}
function dayOverlap(a = [], b = []) {
  const normalized = new Set(a.map(normalizeDayKey));
  return b.some((day) => normalized.has(normalizeDayKey(day)));
}
function groupOverlapsSlot(group, days, start, end) {
  return groupSessions(group).some((session) =>
    dayOverlap([session.day], days) && timeRangesOverlap(session.timeStart, session.timeEnd, start, end));
}
function slotPressure(days, start, end) {
  const conflicts = state.groups.filter((group) => group.status !== "done" && groupOverlapsSlot(group, days, start, end));
  const fullness = conflicts.reduce((sum, group) => sum + groupStats(group).fullness, 0);
  return { conflicts, score: (conflicts.length * 100) + fullness };
}
function hydratePlannerControls() {
  const select = document.getElementById("plannerTraining");
  if (!select) return;
  const current = select.value;
  select.replaceChildren(option("Créer une nouvelle formation", ""));
  state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(`${program.name}${program.durationLabel ? ` - ${program.durationLabel}` : ""}`, program.id)));
  if (state.programs.some((program) => program.id === current)) select.value = current;
}
function buildPlannerSuggestions() {
  const preferredMode = document.getElementById("plannerMode")?.value || "fixed";
  const targetCapacity = Math.max(1, Number(document.getElementById("plannerCapacity")?.value || 20));
  const timeOptions = [
    ...PLANNER_TIME_SLOTS,
    ...state.groups.flatMap((group) => groupSessions(group).map((session) => [session.timeStart, session.timeEnd])).filter(([start, end]) => start && end),
  ];
  const uniqueTimes = [...new Map(timeOptions.map(([start, end]) => [`${start}-${end}`, [start, end]])).values()]
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const candidates = [];
  WEEK_DAYS.forEach((day) => {
    const days = [day.key];
    const daysText = day.label;
    uniqueTimes.forEach(([start, end]) => {
      const pressure = slotPressure(days, start, end);
      const teacherAvailable = isSlotAvailable(day.key, start, end);
      if (preferredMode !== "flexible_shift") {
        candidates.push({ daysText, days, start, end, capacity: targetCapacity, attendanceMode: "fixed", pressure, teacherAvailable });
        return;
      }
      const alternate = Number(start.slice(0, 2)) < 14 ? ["18:00", "20:00"] : ["10:00", "12:00"];
      const alternatePressure = slotPressure(days, alternate[0], alternate[1]);
      const conflictMap = new Map([...pressure.conflicts, ...alternatePressure.conflicts].map((group) => [group.id, group]));
      candidates.push({
        daysText,
        days,
        start,
        end,
        capacity: targetCapacity,
        attendanceMode: "flexible_shift",
        alternateDaysText: daysText,
        alternateTimeStart: alternate[0],
        alternateTimeEnd: alternate[1],
        pressure: { conflicts: [...conflictMap.values()], score: pressure.score + alternatePressure.score + 15 },
      });
    });
  });
  return candidates;
}
function plannerSlotKey(suggestion) {
  return `${normalizeDayKey(suggestion.days?.[0] || suggestion.daysText)}|${suggestion.start}|${suggestion.end}`;
}
function plannerSlotStatus(suggestion) {
  if (suggestion.teacherAvailable === false) {
    return { className: "blocked", pill: "quality-weak", label: "Prof non disponible", action: "Bloqué", blocked: true };
  }
  const conflicts = suggestion.pressure?.conflicts?.length || 0;
  if (!conflicts) return { className: "free", pill: "quality-strong", label: "Créneau libre", action: "Créer ici" };
  if (conflicts <= 1) return { className: "warning", pill: "quality-watch", label: "1 conflit possible", action: "Voir la journée" };
  return { className: "busy", pill: "quality-weak", label: `${conflicts} conflits possibles`, action: "Voir la journée" };
}
function selectedPlannerDayInfo() {
  if (!WEEK_DAYS.some((day) => day.key === plannerSelectedDay)) plannerSelectedDay = "monday";
  return WEEK_DAYS.find((day) => day.key === plannerSelectedDay) || WEEK_DAYS[0];
}
// Teacher availability: default is available. A weekly false means blocked; a date override wins over weekly.
function availabilityData() {
  const data = state.availability || {};
  return { weekly: data.weekly || {}, overrides: data.overrides || {} };
}
function isSlotAvailable(dayKey, start, end, date = "") {
  const { weekly, overrides } = availabilityData();
  if (date && overrides[date] && Object.prototype.hasOwnProperty.call(overrides[date], `${start}|${end}`)) {
    return overrides[date][`${start}|${end}`];
  }
  const weeklyKey = `${normalizeDayKey(dayKey)}|${start}|${end}`;
  return Object.prototype.hasOwnProperty.call(weekly, weeklyKey) ? weekly[weeklyKey] : true;
}
async function toggleAvailability(dayKey, start, end) {
  if (!studentDataUnlocked()) return;
  const currentlyAvailable = isSlotAvailable(dayKey, start, end);
  try {
    const availability = await api("/api/availability", {
      method: "POST",
      body: JSON.stringify({ day: dayKey, timeStart: start, timeEnd: end, available: !currentlyAvailable }),
    });
    state.availability = availability;
    renderPlannerSuggestions();
    toast(currentlyAvailable ? "Professeur marqué non disponible" : "Professeur marqué disponible");
  } catch (error) {
    toast(error.message, "error");
  }
}
function renderAvailabilityGrid(container) {
  const times = PLANNER_TIME_SLOTS.slice();
  // Include any custom session times so the agent can toggle those exact slots too.
  state.groups.forEach((group) => groupSessions(group).forEach((session) => {
    if (!times.some(([s, e]) => s === session.timeStart && e === session.timeEnd)) times.push([session.timeStart, session.timeEnd]);
  }));
  times.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const header = `<div class="planner-week-head"><div><p class="section-kicker">Disponibilité du professeur</p><h4>Cliquez pour activer / désactiver</h4><p>Vert = disponible. Gris = non disponible. Ces créneaux bloqués sont exclus du planning des groupes.</p></div><div class="planner-legend"><span><i class="free"></i>Disponible</span><span><i class="busy"></i>Non disponible</span></div></div>`;
  const gridHead = `<div class="planner-grid-cell planner-time-head">Heures</div>${WEEK_DAYS.map((day) => `<div class="planner-grid-cell planner-day-head"><strong>${escapeHtml(day.label)}</strong></div>`).join("")}`;
  const gridRows = times.map(([start, end]) => {
    const cells = WEEK_DAYS.map((day) => {
      const available = isSlotAvailable(day.key, start, end);
      return `<button class="planner-grid-cell planner-slot availability-slot ${available ? "free" : "busy"}" type="button" data-toggle-availability data-day="${escapeHtml(day.key)}" data-start="${escapeHtml(start)}" data-end="${escapeHtml(end)}" aria-pressed="${available}" aria-label="${escapeHtml(`${day.label} ${start}-${end}: ${available ? "disponible" : "non disponible"}`)}"><span>${escapeHtml(available ? "Disponible" : "Non disponible")}</span><strong>${available ? "✓" : "✕"}</strong></button>`;
    }).join("");
    return `<div class="planner-grid-cell planner-time">${escapeHtml(start)}-${escapeHtml(end)}</div>${cells}`;
  }).join("");
  container.innerHTML = `<section class="planner-week availability-week">${header}<div class="planner-calendar" role="grid">${gridHead}${gridRows}</div></section>`;
  applyLanguage(container);
}
function hasSession(group, day, start, end) {
  return groupSessions(group).some((s) => s.day === normalizeDayKey(day) && s.timeStart === start && s.timeEnd === end);
}
async function saveGroupSessions(group, sessions) {
  const updated = await api(`/api/groups/${group.id}/sessions`, { method: "POST", body: JSON.stringify({ sessions }) });
  const idx = state.groups.findIndex((g) => g.id === group.id);
  if (idx >= 0) state.groups[idx] = updated;
  return updated;
}
async function toggleGroupSession(groupId, day, start, end) {
  if (!studentDataUnlocked()) return;
  const group = byId(state.groups, groupId);
  if (!group) return;
  const dayKey = normalizeDayKey(day);
  const exists = hasSession(group, dayKey, start, end);
  const sessions = exists
    ? groupSessions(group).filter((s) => !(s.day === dayKey && s.timeStart === start && s.timeEnd === end))
    : [...groupSessions(group), { day: dayKey, timeStart: start, timeEnd: end }];
  try {
    await saveGroupSessions(group, sessions);
    renderPlannerSuggestions();
    renderGroupCards();
    toast(exists ? "Séance retirée" : "Séance ajoutée");
  } catch (error) { toast(error.message, "error"); }
}
// Auto-distribute the training's weekly sessions (sessionsPerWeek x sessionHours) onto the
// first teacher-available, non-conflicting slots. The agent then confirms/edits by clicking.
function autoDistributeSessions(group) {
  const training = groupTraining(group);
  const count = Math.max(1, Number(training?.sessionsPerWeek || 0) || groupSessions(group).length || 3);
  const hours = Number(training?.sessionHours || 2) || 2;
  const proposed = [];
  const usedDays = new Set();
  for (const day of WEEK_DAYS) {
    if (proposed.length >= count) break;
    if (usedDays.has(day.key)) continue;
    // Prefer a standard slot the teacher is available for, with no clash against other groups.
    const slot = PLANNER_TIME_SLOTS.find(([start, end]) => {
      const spanHours = (minutesForTime(end) - minutesForTime(start)) / 60;
      if (Math.abs(spanHours - hours) > 0.01 && hours !== 2) return false;
      if (!isSlotAvailable(day.key, start, end)) return false;
      const clash = state.groups.some((g) => g.id !== group.id && groupOverlapsSlot(g, [day.key], start, end));
      return !clash;
    }) || PLANNER_TIME_SLOTS.find(([start, end]) => isSlotAvailable(day.key, start, end));
    if (slot) {
      proposed.push({ day: day.key, timeStart: slot[0], timeEnd: slot[1] });
      usedDays.add(day.key);
    }
  }
  return proposed;
}
function renderGroupSessionsPlanner(container) {
  const group = byId(state.groups, sessionsGroupId) || state.groups[0];
  if (!group) {
    container.innerHTML = '<div class="empty">Créez d\'abord un groupe, puis planifiez ses séances ici.</div>';
    applyLanguage(container);
    return;
  }
  sessionsGroupId = group.id;
  const training = groupTraining(group);
  const need = Math.max(0, Number(training?.sessionsPerWeek || 0));
  const have = groupSessions(group).length;
  const times = PLANNER_TIME_SLOTS.slice();
  groupSessions(group).forEach((s) => { if (!times.some(([a, b]) => a === s.timeStart && b === s.timeEnd)) times.push([s.timeStart, s.timeEnd]); });
  times.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const summary = `<div class="planner-week-head"><div><p class="section-kicker">Séances de ${escapeHtml(group.name)}</p><h4>${escapeHtml(training?.name || "Formation")}</h4><p>${need ? `Objectif: ${need} séance(s)/semaine × ${number(training?.sessionHours || 2)}h.` : ""} Actuellement: ${have} séance(s). Cliquez une case verte pour ajouter, une case bleue pour retirer.</p></div><div class="planner-legend"><span><i class="free"></i>Ajouter</span><span><i class="picked"></i>Séance du groupe</span><span><i class="busy"></i>Bloqué</span></div></div>`;
  const gridHead = `<div class="planner-grid-cell planner-time-head">Heures</div>${WEEK_DAYS.map((day) => `<div class="planner-grid-cell planner-day-head"><strong>${escapeHtml(day.label)}</strong></div>`).join("")}`;
  const gridRows = times.map(([start, end]) => {
    const cells = WEEK_DAYS.map((day) => {
      const picked = hasSession(group, day.key, start, end);
      const available = isSlotAvailable(day.key, start, end);
      const otherClash = state.groups.some((g) => g.id !== group.id && groupOverlapsSlot(g, [day.key], start, end));
      if (!available && !picked) return `<div class="planner-grid-cell planner-slot blocked"><span>Prof non dispo</span><strong>✕</strong></div>`;
      const cls = picked ? "picked" : otherClash ? "warning" : "free";
      const label = picked ? "Séance ✓" : otherClash ? "Autre groupe" : "Ajouter";
      return `<button class="planner-grid-cell planner-slot ${cls}" type="button" data-toggle-session data-group="${escapeHtml(group.id)}" data-day="${escapeHtml(day.key)}" data-start="${escapeHtml(start)}" data-end="${escapeHtml(end)}" aria-pressed="${picked}"><span>${escapeHtml(label)}</span><strong>${picked ? "Retirer" : "+"}</strong></button>`;
    }).join("");
    return `<div class="planner-grid-cell planner-time">${escapeHtml(start)}-${escapeHtml(end)}</div>${cells}`;
  }).join("");
  container.innerHTML = `<section class="planner-week sessions-week">${summary}<div class="planner-calendar" role="grid">${gridHead}${gridRows}</div></section>`;
  applyLanguage(container);
}
function hydrateSessionsGroupPick() {
  const select = document.getElementById("sessionsGroupPick");
  if (!select) return;
  select.replaceChildren();
  state.groups.slice()
    .sort((a, b) => (groupTraining(a)?.name || "").localeCompare(groupTraining(b)?.name || "") || a.name.localeCompare(b.name))
    .forEach((group) => select.append(option(`${groupTraining(group)?.name || "Formation"} · ${group.name}`, group.id)));
  if (!state.groups.some((g) => g.id === sessionsGroupId)) sessionsGroupId = state.groups[0]?.id || "";
  select.value = sessionsGroupId;
}
function renderPlannerSuggestions() {
  const container = document.getElementById("plannerSuggestions");
  if (!container) return;
  document.getElementById("sessionsControls")?.classList.toggle("hidden", plannerView !== "sessions");
  if (plannerView === "sessions") { hydrateSessionsGroupPick(); return renderGroupSessionsPlanner(container); }
  if (plannerView === "availability") return renderAvailabilityGrid(container);
  plannerSuggestions = buildPlannerSuggestions();
  if (!plannerSuggestions.length) {
    container.innerHTML = '<div class="empty">Ajoutez une formation ou un groupe existant pour recevoir des propositions.</div>';
    applyLanguage(container);
    return;
  }
  const slotIndex = new Map(plannerSuggestions.map((suggestion, index) => [plannerSlotKey(suggestion), index]));
  const times = [...new Set(plannerSuggestions.map((suggestion) => `${suggestion.start}-${suggestion.end}`))]
    .map((range) => range.split("-"))
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const selectedDay = selectedPlannerDayInfo();
  const dayStats = WEEK_DAYS.map((day) => {
    const slots = plannerSuggestions.filter((suggestion) => normalizeDayKey(suggestion.days?.[0] || suggestion.daysText) === day.key);
    const free = slots.filter((slot) => !slot.pressure.conflicts.length).length;
    const busy = slots.length - free;
    const best = slots.slice().sort((a, b) => a.pressure.score - b.pressure.score || a.start.localeCompare(b.start))[0];
    return { day, slots, free, busy, best };
  });
  const header = `<div class="planner-week-head"><div><p class="section-kicker">Calendrier hebdomadaire</p><h4>Tous les jours visibles</h4><p>Vert = libre. Orange = conflit léger. Rouge = chargé. Cliquez sur un jour pour voir les heures exactes.</p></div><div class="planner-legend"><span><i class="free"></i>Disponible</span><span><i class="warning"></i>Conflit</span><span><i class="busy"></i>Chargé</span></div></div>`;
  const dayTabs = `<div class="planner-day-tabs">${dayStats.map(({ day, free, busy }) => `<button class="${day.key === selectedDay.key ? "active" : ""}" type="button" data-planner-day="${escapeHtml(day.key)}"><strong>${escapeHtml(day.label)}</strong><span>${free} créneaux libres · ${busy} conflits</span></button>`).join("")}</div>`;
  const gridHead = `<div class="planner-grid-cell planner-time-head">Heures exactes</div>${WEEK_DAYS.map((day) => `<button class="planner-grid-cell planner-day-head ${day.key === selectedDay.key ? "active" : ""}" type="button" data-planner-day="${escapeHtml(day.key)}"><strong>${escapeHtml(day.label)}</strong><small>${dayStats.find((item) => item.day.key === day.key)?.free || 0} créneaux libres</small></button>`).join("")}`;
  const gridRows = times.map(([start, end]) => {
    const cells = WEEK_DAYS.map((day) => {
      const index = slotIndex.get(`${day.key}|${start}|${end}`);
      const suggestion = plannerSuggestions[index];
      if (!suggestion) return '<div class="planner-grid-cell planner-slot empty-slot">—</div>';
      const status = plannerSlotStatus(suggestion);
      const conflicts = suggestion.pressure.conflicts.length;
      if (status.blocked) {
        return `<div class="planner-grid-cell planner-slot ${status.className}" aria-label="${escapeHtml(`${day.label} ${start}-${end}: ${status.label}`)}"><span>${escapeHtml(status.label)}</span><strong>Bloqué</strong></div>`;
      }
      const actionAttr = conflicts ? `data-planner-day="${escapeHtml(day.key)}"` : `data-create-plan="${index}"`;
      return `<button class="planner-grid-cell planner-slot ${status.className}" type="button" ${actionAttr} aria-label="${escapeHtml(`${day.label} ${start}-${end}: ${status.label}`)}"><span>${escapeHtml(status.label)}</span><strong>${escapeHtml(conflicts ? "Voir la journée" : "Créer ici")}</strong></button>`;
    }).join("");
    return `<div class="planner-grid-cell planner-time">${escapeHtml(start)}-${escapeHtml(end)}</div>${cells}`;
  }).join("");
  const selectedSlots = plannerSuggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .filter(({ suggestion }) => normalizeDayKey(suggestion.days?.[0] || suggestion.daysText) === selectedDay.key)
    .sort((a, b) => a.suggestion.start.localeCompare(b.suggestion.start));
  const selectedFree = selectedSlots.filter(({ suggestion }) => !suggestion.pressure.conflicts.length).length;
  const selectedBusy = selectedSlots.length - selectedFree;
  const detail = `<article class="planner-day-detail"><div class="planner-day-summary"><div><p class="section-kicker">Jour détaillé</p><h4>${escapeHtml(selectedDay.label)}</h4><p>${selectedFree} créneaux libres · ${selectedBusy} conflits</p></div><span class="status-pill quality-strong">Meilleur créneau: ${escapeHtml(dayStats.find((item) => item.day.key === selectedDay.key)?.best?.start || "-")}</span></div><p class="form-hint">Cliquez sur une case verte pour créer le groupe directement. Cliquez sur un jour pour voir toutes les heures libres et occupées.</p><div class="planner-day-slots">${selectedSlots.map(({ suggestion, index }) => {
    const status = plannerSlotStatus(suggestion);
    const conflicts = suggestion.pressure.conflicts || [];
    const shift = suggestion.attendanceMode === "flexible_shift" ? `<small>Nidam shift: ${escapeHtml(suggestion.alternateDaysText)} ${escapeHtml(suggestion.alternateTimeStart)}-${escapeHtml(suggestion.alternateTimeEnd)}</small>` : "<small>Groupe fixe</small>";
    const conflictText = conflicts.length ? conflicts.slice(0, 3).map((group) => group.name).join(", ") : "Aucun groupe dans ce créneau.";
    const more = conflicts.length > 3 ? ` + ${conflicts.length - 3}` : "";
    return `<article class="planner-day-slot ${status.className}"><div><span class="status-pill ${status.pill}">${escapeHtml(status.label)}</span><strong>${escapeHtml(suggestion.start)}-${escapeHtml(suggestion.end)}</strong>${shift}<small>${escapeHtml(conflictText)}${escapeHtml(more)}</small><small>Capacité proposée: ${number(suggestion.capacity)} étudiants</small></div><button class="button ${conflicts.length ? "secondary" : "primary"}" type="button" data-create-plan="${index}">${conflicts.length ? "Créer quand même" : "Créer ce planning"}</button></article>`;
  }).join("")}</div></article>`;
  container.innerHTML = `<section class="planner-week">${header}${dayTabs}<div class="planner-calendar" role="grid">${gridHead}${gridRows}</div>${detail}</section>`;
  applyLanguage(container);
}
async function createSuggestedPlan(index) {
  if (!studentDataUnlocked()) return;
  const suggestion = plannerSuggestions[Number(index)];
  if (!suggestion) return toast("Relancez les propositions avant de créer le groupe", "error");
  const selectedProgramId = document.getElementById("plannerTraining")?.value || "";
  const newTrainingName = document.getElementById("plannerTrainingName")?.value.trim() || "";
  const durationLabel = document.getElementById("plannerDuration")?.value.trim() || "";
  if (!selectedProgramId && !newTrainingName) return toast("Choisissez une formation ou tapez le nom de la nouvelle formation", "error");
  let programId = selectedProgramId;
  if (!programId) {
    const program = await api("/api/programs", { method: "POST", body: JSON.stringify({ name: newTrainingName, durationLabel }) });
    programId = program.id;
  }
  const program = byId(state.programs, programId);
  const sessions = [{ day: normalizeDayKey(suggestion.days?.[0] || suggestion.daysText), timeStart: suggestion.start, timeEnd: suggestion.end }];
  if (suggestion.attendanceMode === "flexible_shift" && suggestion.alternateTimeStart) {
    sessions.push({ day: normalizeDayKey(suggestion.alternateDaysText || suggestion.daysText), timeStart: suggestion.alternateTimeStart, timeEnd: suggestion.alternateTimeEnd });
  }
  await api("/api/groups", {
    method: "POST",
    body: JSON.stringify({
      programId,
      name: `${program?.name || newTrainingName} ${suggestion.daysText} ${suggestion.start}`,
      durationLabel: durationLabel || program?.durationLabel || "",
      capacity: suggestion.capacity,
      sessions,
    }),
  });
  await load();
  toast("Planning créé. Vérifiez le groupe puis ajoutez les étudiants.");
}
function groupPrice(group) {
  const training = groupTraining(group);
  return Number(group?.discountedPrice || group?.price || trainingCashPrice(training) || trainingMonthlyPrice(training) || 0);
}
function groupStats(group) {
  const students = state.students.filter((student) => student.groupId === group.id && student.status !== "cancelled");
  const paid = students.reduce((sum, student) => sum + studentPaid(student), 0);
  const due = students.reduce((sum, student) => sum + Number(student.totalDue || 0), 0);
  const capacity = Math.max(1, Number(group.capacity || 1));
  const enrolled = Number.isFinite(Number(group.enrolledCount)) ? Number(group.enrolledCount) : students.length;
  return { students, enrolled, ownStudents: students.length, capacity, spots: Math.max(0, capacity - enrolled), fullness: Math.min(100, Math.round((enrolled / capacity) * 100)), paid, remaining: Math.max(0, due - paid) };
}
function paymentState(student) {
  const paid = studentPaid(student);
  const remaining = studentRemaining(student);
  if (!paid) return "none";
  return remaining > 0 ? "balance" : "paid";
}
function paymentBadge(student) {
  const status = paymentDueStatus(student);
  return `<div class="payment-status"><span class="status-pill ${status.className}">${escapeHtml(status.label)}</span><small>${escapeHtml(status.detail)}</small></div>`;
}
function filteredGroups() {
  return state.groups.filter((group) => {
    const training = groupTraining(group);
    const text = [group.name, training?.name, group.days?.join(" "), group.timeStart, group.timeEnd, group.alternateDays?.join(" "), group.alternateTimeStart, group.alternateTimeEnd, group.notes].join(" ").toLocaleLowerCase();
    if (operationsFilters.trainingId && group.programId !== operationsFilters.trainingId) return false;
    if (operationsFilters.timing && !groupTimeKeys(group).includes(operationsFilters.timing)) return false;
    if (operationsFilters.search && !text.includes(operationsFilters.search.toLocaleLowerCase())) return false;
    return true;
  });
}
function filteredStudents() {
  return state.students.filter((student) => {
    const group = studentGroup(student);
    const training = studentTraining(student);
    const agent = byId(state.agents, student.agentId);
    const text = [student.name, student.phone, student.notes, group?.name, training?.name, agent?.name].join(" ").toLocaleLowerCase();
    if (operationsFilters.trainingId && group?.programId !== operationsFilters.trainingId) return false;
    if (operationsFilters.timing && !groupTimeKeys(group).includes(operationsFilters.timing)) return false;
    if (operationsFilters.payment && paymentState(student) !== operationsFilters.payment) return false;
    if (operationsFilters.search && !text.includes(operationsFilters.search.toLocaleLowerCase())) return false;
    return true;
  });
}
function hydrateOperationsControls() {
  document.querySelectorAll('[data-ops-filter="trainingId"]').forEach((select) => {
    const current = operationsFilters.trainingId;
    select.replaceChildren(option("Toutes les formations", ""));
    state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(program.name, program.id)));
    select.value = current;
  });
  document.querySelectorAll('[data-ops-filter="timing"]').forEach((select) => {
    const current = operationsFilters.timing;
    const timings = [...new Set(state.groups.flatMap(groupTimeKeys))].sort();
    select.replaceChildren(option("Tous les horaires", ""));
    timings.forEach((timing) => select.append(option(timing, timing)));
    select.value = current;
  });
  document.querySelectorAll("[data-ops-filter]").forEach((control) => { control.value = operationsFilters[control.dataset.opsFilter] || ""; });
  hydratePlannerControls();
}
function renderOperationsKpis() {
  const groups = filteredGroups();
  const students = filteredStudents();
  const capacity = groups.reduce((sum, group) => sum + Math.max(0, Number(group.capacity || 0)), 0);
  const occupied = groups.reduce((sum, group) => sum + groupStats(group).enrolled, 0);
  const remainingSpots = Math.max(0, capacity - occupied);
  const totalPaid = students.reduce((sum, student) => sum + studentPaid(student), 0);
  const totalRemaining = students.reduce((sum, student) => sum + studentRemaining(student), 0);
  const items = [
    ["Groupes", number(groups.length), "groupes filtrés", "neutral"],
    ["Places utilisées", `${number(occupied)} / ${number(capacity)}`, `${number(remainingSpots)} places restantes`, "blue"],
    ["Étudiants", number(students.length), "registre filtré", "green"],
    ["Encaissé", money(totalPaid), "paiements enregistrés", "violet"],
    ["Reste à payer", money(totalRemaining), "à relancer", totalRemaining ? "amber" : "green"],
  ];
  document.getElementById("operationsKpis").innerHTML = items.map(([label, value, detail, style]) => `<article class="kpi ${style}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
}
function renderGroupCards() {
  const groups = filteredGroups();
  document.getElementById("groupCards").innerHTML = groups.length ? groups.map((group) => {
    const training = groupTraining(group);
    const stats = groupStats(group);
    const full = stats.spots === 0;
    const teacherAvailable = groupTeacherAvailable(group);
    const availabilityPill = teacherAvailable ? "" : '<span class="status-pill quality-weak">Prof non disponible</span>';
    return `<article class="card group-card ${full ? "is-full" : ""}"><div class="group-card-head"><div><span class="status-pill ${full ? "quality-watch" : "quality-strong"}">${full ? "Complet" : `${stats.spots} places libres`}</span>${availabilityPill}<h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(training?.name || "Formation inconnue")} ${group.durationLabel ? `- ${escapeHtml(group.durationLabel)}` : ""}</p></div><strong>${stats.fullness}%</strong></div><div class="capacity-bar" role="img" aria-label="${stats.enrolled} of ${stats.capacity} seats used"><span style="width:${stats.fullness}%"></span></div><div class="group-meta"><span>${escapeHtml(groupSchedule(group))}</span><span>${escapeHtml(group.startDate || "Pas de date début")} ${group.endDate ? `à ${escapeHtml(group.endDate)}` : ""}</span><span>${money(groupPrice(group))} prix par défaut</span></div><div class="group-numbers"><span><strong>${stats.enrolled}</strong> étudiants</span><span><strong>${money(stats.paid)}</strong> payé</span><span><strong>${money(stats.remaining)}</strong> reste</span></div><div class="agent-actions"><button class="button secondary" type="button" data-view-group="${escapeHtml(group.id)}">Voir étudiants</button><button class="button primary" type="button" data-open-student data-group="${escapeHtml(group.id)}">Inscrire</button></div></article>`;
  }).join("") : '<div class="empty card">Aucun groupe pour le moment. Ajoutez une formation, puis créez le premier groupe planifié.</div>';
}
function renderStudentRows() {
  const students = filteredStudents().sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)) || a.name.localeCompare(b.name));
  document.getElementById("studentRows").innerHTML = students.length ? students.map((student) => {
    const group = studentGroup(student);
    const training = studentTraining(student);
    const agent = byId(state.agents, student.agentId);
    return `<tr><td><button class="link-button" type="button" data-student-detail="${escapeHtml(student.id)}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.phone || "Sans téléphone")}</small></button></td><td><div class="entity-cell"><strong>${escapeHtml(group?.name || "Sans groupe")}</strong><small>${escapeHtml(training?.name || "Formation inconnue")} - ${escapeHtml(group ? groupSchedule(group) : "")}</small></div></td><td>${escapeHtml(agent?.name || "Non assigné")}</td><td>${escapeHtml(student.registeredAt || "-")}</td><td class="number-cell">${money(studentPaid(student))}</td><td class="number-cell"><strong>${money(studentRemaining(student))}</strong><small>${escapeHtml(paymentAgreementSummary(student))}</small></td><td>${paymentBadge(student)}</td><td><div class="agent-actions"><button class="row-add" type="button" data-add-payment="${escapeHtml(student.id)}" aria-label="Ajouter paiement pour ${escapeHtml(student.name)}">+</button><button class="icon-button small" type="button" data-edit-student="${escapeHtml(student.id)}" aria-label="Modifier ${escapeHtml(student.name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16.6 10.9-10.9 2.4 2.4L7.4 19H5v-2.4ZM17.1 4.5l1.1-1.1c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2l-1.1 1.1-2.4-2.4Z"/></svg></button></div></td></tr>`;
  }).join("") : '<tr><td colspan="8" class="empty">Aucun étudiant ne correspond à ces filtres.</td></tr>';
}
function renderPaymentAlerts() {
  const urgency = { overdue: 0, due: 1, due_soon: 2, scheduled: 3, balance: 4, none: 5, paid: 9 };
  const rows = filteredStudents().filter((student) => studentRemaining(student) > 0).sort((a, b) => {
    const statusA = paymentDueStatus(a);
    const statusB = paymentDueStatus(b);
    return (urgency[statusA.key] ?? 8) - (urgency[statusB.key] ?? 8)
      || String(a.nextPaymentDate || "9999-99-99").localeCompare(String(b.nextPaymentDate || "9999-99-99"))
      || studentRemaining(b) - studentRemaining(a);
  }).slice(0, 12);
  document.getElementById("paymentAlerts").innerHTML = rows.length ? rows.map((student) => {
    const group = studentGroup(student);
    const status = paymentDueStatus(student);
    return `<div class="simple-list-row payment-alert-row"><div><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(group?.name || "Sans groupe")} - ${escapeHtml(paymentAgreementSummary(student))}</small><span class="status-pill ${status.className}">${escapeHtml(status.label)}</span></div><div class="balance-actions"><strong>${money(studentRemaining(student))}</strong><button class="row-add" type="button" data-add-payment="${escapeHtml(student.id)}" aria-label="Ajouter paiement pour ${escapeHtml(student.name)}">+</button></div></div>`;
  }).join("") : '<div class="empty success-empty">Aucun reste à payer dans cette vue.</div>';
}
function renderOperations() {
  if (!document.getElementById("operationsKpis")) return;
  const warning = document.getElementById("studentSecurityWarning");
  const missingSalesAgent = currentUser?.role === "sales" && !currentUser.agentId;
  if (warning) {
    warning.classList.toggle("hidden", authEnabled && !sensitiveLocked && !missingSalesAgent);
    if (missingSalesAgent) {
      warning.innerHTML = `<strong>Compte commercial non lié.</strong> Créez d'abord un agent nommé ${escapeHtml(currentUser.agentName || currentUser.username || "comme CRM_SALES_AGENT")} avec le compte admin.`;
    } else {
      warning.innerHTML = "<strong>Zone étudiants verrouillée.</strong> Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir des noms, téléphones ou paiements.";
    }
  }
  hydrateOperationsControls();
  renderOperationsKpis();
  renderPlannerSuggestions();
  renderGroupCards();
  renderPaymentAlerts();
  renderStudentRows();
}

// ---- Dedicated Students page ----
function studentsMatchingFilters() {
  return state.students.filter((student) => {
    if (studentsFilters.trainingId && student.programId !== studentsFilters.trainingId) return false;
    if (studentsFilters.groupId && student.groupId !== studentsFilters.groupId) return false;
    if (studentsFilters.status && student.status !== studentsFilters.status) return false;
    if (studentsFilters.payment) {
      const status = paymentDueStatus(student);
      const paid = studentPaid(student);
      if (studentsFilters.payment === "paid" && studentRemaining(student) > 0) return false;
      if (studentsFilters.payment === "balance" && studentRemaining(student) <= 0) return false;
      if (studentsFilters.payment === "overdue" && status.key !== "overdue") return false;
      if (studentsFilters.payment === "due_soon" && !["due", "due_soon"].includes(status.key)) return false;
      if (studentsFilters.payment === "none" && paid > 0) return false;
    }
    if (studentsFilters.search) {
      const group = studentGroup(student);
      const text = [student.name, student.phone, group?.name, studentTraining(student)?.name].join(" ").toLocaleLowerCase();
      if (!text.includes(studentsFilters.search.toLocaleLowerCase())) return false;
    }
    return true;
  });
}
function renderStudentsKpis() {
  const container = document.getElementById("studentsKpis");
  if (!container) return;
  const list = studentsMatchingFilters();
  const totalDue = list.reduce((sum, s) => sum + Number(s.totalDue || 0), 0);
  const paid = list.reduce((sum, s) => sum + studentPaid(s), 0);
  const remaining = list.reduce((sum, s) => sum + studentRemaining(s), 0);
  const overdue = list.filter((s) => paymentDueStatus(s).key === "overdue").length;
  const items = [
    ["Étudiants", number(list.length), "dans ce filtre", "green"],
    ["Encaissé", money(paid), "total payé", "violet"],
    ["Reste à payer", money(remaining), "solde ouvert", remaining > 0 ? "amber" : "green"],
    ["En retard", number(overdue), "paiements dépassés", overdue > 0 ? "amber" : "green"],
  ];
  container.innerHTML = items.map(([label, value, detail, style]) => `<article class="kpi ${style}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  applyLanguage(container);
}
function renderStudentsTrainingCards() {
  const container = document.getElementById("studentsTrainingCards");
  if (!container) return;
  const cards = [{ id: "", name: "Toutes les formations" }, ...state.programs.slice().sort((a, b) => a.name.localeCompare(b.name))];
  container.innerHTML = cards.map((training) => {
    const students = training.id ? state.students.filter((s) => s.programId === training.id) : state.students;
    const remaining = students.reduce((sum, s) => sum + studentRemaining(s), 0);
    const active = studentsFilters.trainingId === training.id;
    return `<button type="button" class="training-filter-card ${active ? "active" : ""}" data-students-training="${escapeHtml(training.id)}"><strong>${escapeHtml(training.name)}</strong><small>${number(students.length)} étudiant(s)</small><small>${money(remaining)} reste</small></button>`;
  }).join("");
  applyLanguage(container);
}
function hydrateStudentsFilters() {
  const groupSelect = document.querySelector('[data-students-filter="groupId"]');
  if (groupSelect) {
    const current = studentsFilters.groupId;
    groupSelect.replaceChildren(option("Tous les groupes", ""));
    state.groups
      .filter((g) => !studentsFilters.trainingId || g.programId === studentsFilters.trainingId)
      .slice().sort((a, b) => a.name.localeCompare(b.name))
      .forEach((g) => groupSelect.append(option(`${g.name} · ${groupTraining(g)?.name || ""}`, g.id)));
    groupSelect.value = state.groups.some((g) => g.id === current) ? current : "";
  }
  document.querySelectorAll("[data-students-filter]").forEach((control) => {
    if (control.dataset.studentsFilter !== "groupId") control.value = studentsFilters[control.dataset.studentsFilter] || "";
  });
}
function renderStudentsList() {
  const container = document.getElementById("studentsList");
  if (!container) return;
  const students = studentsMatchingFilters().sort((a, b) => {
    const ra = paymentDueStatus(a).key === "overdue" ? 0 : 1;
    const rb = paymentDueStatus(b).key === "overdue" ? 0 : 1;
    return ra - rb || a.name.localeCompare(b.name);
  });
  if (!students.length) {
    container.innerHTML = '<div class="empty card">Aucun étudiant ne correspond à ces filtres.</div>';
    applyLanguage(container);
    return;
  }
  container.innerHTML = students.map((student) => {
    const group = studentGroup(student);
    const training = studentTraining(student);
    const agent = byId(state.agents, student.agentId);
    const paid = studentPaid(student);
    const total = Number(student.totalDue || 0);
    const remaining = studentRemaining(student);
    const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (paid > 0 ? 100 : 0);
    const due = paymentDueStatus(student);
    const statusLabel = { registered: "Inscrit", active: "Actif", paused: "Pause", completed: "Terminé", cancelled: "Annulé" }[student.status] || student.status;
    return `<button type="button" class="student-card" data-student-detail="${escapeHtml(student.id)}">
      <div class="student-card-head"><div><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.phone || "Sans téléphone")}</small></div><span class="status-pill ${due.className}">${escapeHtml(due.label)}</span></div>
      <div class="student-card-meta"><span>${escapeHtml(training?.name || "Formation")}</span><span>${escapeHtml(group?.name || "Sans groupe")}</span><span class="pill-mini">${escapeHtml(statusLabel)}</span><span>${escapeHtml(agent?.name || "Non assigné")}</span></div>
      <div class="student-card-pay"><div class="progress-track" role="img" aria-label="${percent}% payé"><i style="width:${percent}%"></i></div><div class="student-card-figures"><span>${money(paid)} / ${money(total)}</span><strong>${money(remaining)} reste</strong></div></div>
    </button>`;
  }).join("");
  applyLanguage(container);
}
function renderStudentsPage() {
  if (!document.getElementById("studentsList")) return;
  const warning = document.getElementById("studentsSecurityWarning");
  if (warning) warning.classList.toggle("hidden", authEnabled && !sensitiveLocked);
  renderStudentsKpis();
  renderStudentsTrainingCards();
  hydrateStudentsFilters();
  renderStudentsList();
}

function studentDataUnlocked() {
  if (currentUser?.role === "sales" && !currentUser.agentId) {
    toast("Ce compte commercial n'est pas lié à un agent. Créez l'agent correspondant avec le compte admin.", "error");
    document.getElementById("studentSecurityWarning")?.classList.remove("hidden");
    return false;
  }
  if (authEnabled && !sensitiveLocked) return true;
  toast("Configurez CRM_USER et CRM_PASSWORD sur Hostinger avant de saisir les données étudiants.", "error");
  document.getElementById("studentSecurityWarning")?.classList.remove("hidden");
  return false;
}

function renderImports() {
  document.getElementById("importRows").innerHTML = state.imports.length ? state.imports.slice(0, 20).map((item) => `<tr><td>${escapeHtml(new Date(item.importedAt).toLocaleString())}</td><td><strong>${escapeHtml(item.filename)}</strong></td><td class="number-cell">${item.rows}</td><td class="number-cell">${item.campaignsAdded}</td><td class="number-cell">${item.adSetsAdded}</td><td class="number-cell">${item.adsAdded}</td><td class="number-cell">${item.metricsUpdated}</td></tr>`).join("") : '<tr><td colspan="7" class="empty">No Meta Ads reports imported yet.</td></tr>';
}

function manualBudgetPresetRange(preset) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: iso(today), to: iso(today) };
  if (preset === "last2") { const f = new Date(today); f.setDate(f.getDate() - 1); return { from: iso(f), to: iso(today) }; }
  if (preset === "last7") { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(today) }; }
  return null; // custom
}
function hydrateManualBudgetTarget() {
  const level = document.getElementById("manualBudgetLevel")?.value || "center";
  const field = document.getElementById("manualBudgetTargetField");
  const label = document.getElementById("manualBudgetTargetLabel");
  const select = document.getElementById("manualBudgetTarget");
  if (!field || !select) return;
  if (level === "center") { field.classList.add("hidden"); select.required = false; return; }
  field.classList.remove("hidden");
  select.required = true;
  let items = [];
  if (level === "agent") { label.textContent = "Agent"; items = state.agents.map((a) => [a.name, a.id]); }
  else if (level === "campaign") { label.textContent = "Campagne"; items = state.campaigns.map((c) => [c.name, c.id]); }
  else if (level === "adset") { label.textContent = "Ad set"; items = state.adSets.map((s) => [s.name, s.id]); }
  const current = select.value;
  select.replaceChildren(option("Choisir…", ""));
  items.slice().sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([name, id]) => select.append(option(name, id)));
  if (items.some(([, id]) => id === current)) select.value = current;
}
function syncManualBudgetDates() {
  const preset = document.getElementById("manualBudgetPreset")?.value || "today";
  const fromField = document.getElementById("manualBudgetFromField");
  const toField = document.getElementById("manualBudgetToField");
  const form = document.getElementById("manualBudgetForm");
  if (!form) return;
  const range = manualBudgetPresetRange(preset);
  const custom = !range;
  fromField?.classList.toggle("hidden", !custom);
  toField?.classList.toggle("hidden", !custom);
  if (range) { form.elements.from.value = range.from; form.elements.to.value = range.to; }
}
function manualBudgetBatches() {
  // Group manual logs by batchId for a compact editable list.
  const batches = new Map();
  state.dailyLogs.filter((log) => log.source === "manual").forEach((log) => {
    const key = log.batchId || log.id;
    if (!batches.has(key)) batches.set(key, { batchId: key, total: 0, days: new Set(), from: log.date, to: log.date, log });
    const b = batches.get(key);
    b.total += Number(log.spend || 0);
    b.days.add(log.date);
    if (log.date < b.from) b.from = log.date;
    if (log.date > b.to) b.to = log.date;
  });
  return [...batches.values()].sort((a, b) => String(b.to).localeCompare(String(a.to)));
}
function manualBudgetTargetName(log) {
  if (log.agentId) return byId(state.agents, log.agentId)?.name || "Agent";
  if (log.adSetId) return byId(state.adSets, log.adSetId)?.name || "Ad set";
  if (log.campaignId) return byId(state.campaigns, log.campaignId)?.name || "Campagne";
  return "Centre (global)";
}
function renderManualBudget() {
  const container = document.getElementById("manualBudgetList");
  if (!container) return;
  hydrateManualBudgetTarget();
  syncManualBudgetDates();
  const batches = manualBudgetBatches();
  container.innerHTML = batches.length ? batches.map((b) => {
    const span = b.days.size > 1 ? `${b.from} → ${b.to} · ${b.days.size} jours` : b.from;
    const label = b.log.label ? `${escapeHtml(b.log.label)} · ` : "";
    return `<div class="simple-list-row"><div><strong>${money(b.total)}</strong><small>${label}${escapeHtml(manualBudgetTargetName(b.log))} · ${escapeHtml(span)}</small></div><button class="icon-button small" type="button" data-delete-budget="${escapeHtml(b.batchId)}" aria-label="Supprimer ce budget">✕</button></div>`;
  }).join("") : '<div class="empty">Aucun budget manuel. Ajoutez-en un ci-dessus.</div>';
  applyLanguage(container);
}
function renderStorage() {
  const persistent = Boolean(storageInfo?.persistent);
  const badge = document.getElementById("storageBadge");
  badge.classList.toggle("persistent", persistent);
  badge.querySelector("strong").textContent = storageInfo?.label || "Unknown";
  const userBadge = document.getElementById("userBadge");
  if (userBadge) {
    userBadge.textContent = currentUser?.role === "sales" ? `Sales · ${currentUser.agentName || currentUser.label || "Agent"}` : "Admin";
    userBadge.classList.toggle("sales", currentUser?.role === "sales");
  }
  document.getElementById("storageWarning").classList.toggle("hidden", persistent);
  document.getElementById("storageTitle").textContent = storageInfo?.label || "Unknown storage";
  document.getElementById("storageDescription").textContent = persistent ? "MySQL storage is active. Automatic snapshots are kept before every change." : "Local JSON is for development only. Configure MySQL before entering production data.";
  document.getElementById("lastSaved").textContent = formatSavedAt(state.meta?.updatedAt);
  const counts = [[state.adAccounts.length, "accounts"], [state.campaigns.length, "campaigns"], [state.adSets.length, "ad sets"], [state.creatives.length, "ads"], [state.groups.length, "groups"], [state.students.length, "students"], [state.payments.length, "payments"], [state.outcomes.length, "outcomes"], [state.imports.length, "imports"]];
  document.getElementById("systemCounts").innerHTML = counts.map(([value, label]) => `<span class="system-count"><strong>${value}</strong> ${label}</span>`).join("");
}

function renderScoringSettings() {
  const notice = document.getElementById("scoringNotice");
  if (!notice) return;
  const rows = performanceRows(groupBy, true, "quality");
  const targets = rows[0]?.qualityTargets || CmcgQuality.deriveTargets(state.settings, rows);
  if (!targets.configured) {
    notice.className = "alert info scoring-alert";
    notice.innerHTML = `<div><strong>Automatic scoring is learning from your real data.</strong><span>Import Meta reports and record booked appointments, visits, and registrations. The CRM will build cost benchmarks as outcomes arrive.</span></div>`;
    return;
  }
  notice.className = "alert info scoring-alert";
  const registered = targets.targetCostRegistered ? `Registration benchmark: ${money(targets.targetCostRegistered)}.` : "Registration benchmark is still learning.";
  const visit = targets.targetCostVisit ? `Visit benchmark: ${money(targets.targetCostVisit)}.` : "";
  const booked = targets.targetCostBooked ? `Booked benchmark: ${money(targets.targetCostBooked)}.` : "";
  notice.innerHTML = `<div><strong>Automatic scoring is active.</strong><span>${escapeHtml(registered)} ${escapeHtml(visit)} ${escapeHtml(booked)} Rows mature after ${targets.closingWindowDays} days.</span></div>`;
}

function hydrateSortOptions() {
  const select = document.getElementById("performanceSort");
  if (!select || select.dataset.ready === "true") return;
  const options = [
    ["quality", "Business quality - highest"],
    ["agentClosing", "Agent closing - highest"],
    ["spendHigh", "Spend - highest"],
    ["spendLow", "Spend - lowest"],
    ["booked", "Booked appointments - most"],
    ["visits", "Total visits - most"],
    ["showed", "Showed, no registration - most"],
    ["registered", "Registered students - most"],
    ["costBooked", "Cost / booked - lowest"],
    ["costVisit", "Cost / visit - lowest"],
    ["costRegistered", "Cost / registered - lowest"],
    ["showRate", "Show rate - highest"],
    ["closeRate", "Close rate - highest"],
    ["messages", "Messages - most"],
  ];
  select.replaceChildren(...options.map(([value, label]) => option(label, value)));
  select.value = sortBy;
  select.dataset.ready = "true";
}

function hydrateFilters() {
  const objectives = [...new Set(state.campaigns.map((campaign) => campaign.objective).filter(Boolean))].sort();
  document.querySelectorAll('[data-filter="agentId"]').forEach((select) => {
    select.replaceChildren(option("All agents", ""));
    state.agents.forEach((agent) => select.append(option(agent.name, agent.id)));
  });
  document.querySelectorAll('[data-filter="objective"]').forEach((select) => {
    select.replaceChildren(option("All objectives", ""));
    objectives.forEach((objective) => select.append(option(objective, objective)));
  });
  document.querySelectorAll('[data-filter="campaignId"]').forEach((select) => {
    select.replaceChildren(option("All campaigns", ""));
    state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name)).forEach((campaign) => select.append(option(campaign.name, campaign.id)));
  });
  document.querySelectorAll("[data-filter]").forEach((control) => { control.value = filters[control.dataset.filter] || ""; });
}

function render() {
  applyRoleAccess();
  updatePeriodControls();
  hydrateFilters();
  hydrateSortOptions();
  document.getElementById("authWarning").classList.toggle("hidden", authEnabled);
  renderGoals(); renderKpis(); renderFunnel(); renderAttention(); renderOverviewTables(); renderPerformance(); renderOutcomes(); renderOperations(); renderStudentsPage(); renderAgents(); renderReport(); renderImports(); renderManualBudget(); renderStorage(); renderScoringSettings();
  applyRoleAccess();
  applyLanguage();
}

function showPanel(name, updateHash = true) {
  if (currentUser?.role === "sales" && !["groups", "students"].includes(name)) name = "groups";
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((item) => item.classList.toggle("active", item.id === name));
  const meta = pageMeta[name] || ["CMCG CRM", ""];
  document.getElementById("pageTitle").textContent = meta[0];
  document.getElementById("pageSubtitle").textContent = meta[1];
  applyLanguage(document.querySelector(".topbar"));
  if (updateHash && window.location.hash !== `#view=${name}`) window.history.replaceState(null, "", `#view=${name}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function targetOptions(level) {
  if (level === "ad") return state.creatives.filter((ad) => ad.metaAdId).sort((a, b) => a.name.localeCompare(b.name)).map((ad) => { const relation = relationForAd(ad); return { id: ad.id, label: `${ad.name} · ${relation.adSet?.name || "No ad set"} · ${relation.agent?.name || "Unassigned"}` }; });
  if (level === "adSet") return state.adSets.filter((adSet) => adSet.metaAdSetId).sort((a, b) => a.name.localeCompare(b.name)).map((adSet) => ({ id: adSet.id, label: `${adSet.name} · ${byId(state.campaigns, adSet.campaignId)?.name || "No campaign"}` }));
  if (level === "campaign") return state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name)).map((campaign) => ({ id: campaign.id, label: `${campaign.name} · ${campaign.objective || "No objective"}` }));
  return state.agents.filter((agent) => agent.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((agent) => ({ id: agent.id, label: agent.name }));
}

function fillSelect(select, rows, emptyLabel, labelForRow) {
  const current = select.value;
  select.replaceChildren(option(emptyLabel, ""));
  rows.forEach((row) => select.append(option(labelForRow(row), row.id)));
  if (rows.some((row) => row.id === current)) select.value = current;
}

function ensureOutcomeTargetId() {
  const visibleTarget = document.getElementById("outcomeTarget");
  let hiddenTarget = document.getElementById("outcomeTargetId");
  visibleTarget.removeAttribute("name");
  visibleTarget.required = false;
  if (!hiddenTarget) {
    hiddenTarget = document.createElement("input");
    hiddenTarget.type = "hidden";
    hiddenTarget.id = "outcomeTargetId";
    hiddenTarget.name = "targetId";
    visibleTarget.after(hiddenTarget);
  }
  return hiddenTarget;
}

function ensureOutcomeHierarchy() {
  let hierarchy = document.getElementById("outcomeHierarchy");
  if (hierarchy) return hierarchy;
  hierarchy = document.createElement("div");
  hierarchy.id = "outcomeHierarchy";
  hierarchy.className = "form-grid outcome-hierarchy hidden";
  hierarchy.innerHTML = `<label><span>Campaign</span><select id="outcomeCampaign"></select></label><label><span>Ad set</span><select id="outcomeAdSet"></select></label><label><span>Ad</span><select id="outcomeAd"></select></label>`;
  document.getElementById("assignmentHint").before(hierarchy);
  ["outcomeCampaign", "outcomeAdSet", "outcomeAd"].forEach((idName) => {
    document.getElementById(idName).addEventListener("change", () => syncOutcomeHierarchy());
  });
  return hierarchy;
}

function preferredOutcomePath(level, targetId) {
  if (!targetId) return {};
  if (level === "ad") {
    const ad = byId(state.creatives, targetId);
    const relation = relationForAd(ad);
    return { campaignId: relation.campaign?.id || "", adSetId: relation.adSet?.id || "", adId: ad?.id || "" };
  }
  if (level === "adSet") {
    const adSet = byId(state.adSets, targetId);
    return { campaignId: byId(state.campaigns, adSet?.campaignId)?.id || "", adSetId: adSet?.id || "", adId: "" };
  }
  if (level === "campaign") return { campaignId: byId(state.campaigns, targetId)?.id || "", adSetId: "", adId: "" };
  return {};
}

function syncOutcomeHierarchy(preferred = {}) {
  const level = document.getElementById("assignmentLevel").value;
  const campaignSelect = document.getElementById("outcomeCampaign");
  const adSetSelect = document.getElementById("outcomeAdSet");
  const adSelect = document.getElementById("outcomeAd");
  const hiddenTarget = ensureOutcomeTargetId();
  const campaigns = state.campaigns.filter((campaign) => campaign.metaCampaignId).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(campaignSelect, campaigns, campaigns.length ? "Choose campaign" : "No campaign available", (campaign) => `${campaign.name} - ${campaign.objective || "No objective"}`);
  if (preferred.campaignId && campaigns.some((campaign) => campaign.id === preferred.campaignId)) campaignSelect.value = preferred.campaignId;

  const adSets = state.adSets.filter((adSet) => adSet.metaAdSetId && adSet.campaignId === campaignSelect.value).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(adSetSelect, adSets, campaignSelect.value ? (adSets.length ? "Choose ad set" : "No ad sets in this campaign") : "Choose campaign first", (adSet) => `${adSet.name} - ${byId(state.agents, adSet.agentId)?.name || "Unassigned"}`);
  adSetSelect.disabled = !campaignSelect.value;
  if (preferred.adSetId && adSets.some((adSet) => adSet.id === preferred.adSetId)) adSetSelect.value = preferred.adSetId;

  const ads = state.creatives.filter((ad) => ad.metaAdId && ad.adSetId === adSetSelect.value).sort((a, b) => a.name.localeCompare(b.name));
  fillSelect(adSelect, ads, adSetSelect.value ? (ads.length ? "Choose exact ad" : "No ads in this ad set") : "Choose ad set first", (ad) => `${ad.name} - ${ad.code || "no code"}`);
  adSelect.disabled = !adSetSelect.value;
  if (preferred.adId && ads.some((ad) => ad.id === preferred.adId)) adSelect.value = preferred.adId;

  hiddenTarget.value = level === "campaign" ? campaignSelect.value : level === "adSet" ? adSetSelect.value : adSelect.value;
  renderOutcomeAgentBox();
  applyLanguage(document.getElementById("outcomeDialog"));
}

// The agent is read from the ad set name, then the campaign. Only when neither names one
// does the form ask for an agent, and leaving it empty is allowed.
function outcomeResolvedAgent(level, targetId) {
  const ad = level === "ad" ? byId(state.creatives, targetId) : null;
  const adSet = level === "adSet" ? byId(state.adSets, targetId) : byId(state.adSets, ad?.adSetId);
  const campaign = level === "campaign" ? byId(state.campaigns, targetId) : byId(state.campaigns, adSet?.campaignId);
  if (adSet?.agentId) return { agent: byId(state.agents, adSet.agentId), source: adSet.agentMatchSource === "campaign" ? "from the campaign name" : "from the ad set name" };
  if (campaign?.agentId && !adSet?.agentMatchHint) return { agent: byId(state.agents, campaign.agentId), source: campaign.agentMatchSource === "campaign" ? "from the campaign name" : "from its ad sets" };
  return { agent: null, source: "" };
}

function renderOutcomeAgentBox() {
  let box = document.getElementById("outcomeAgentBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "outcomeAgentBox";
    box.className = "outcome-agent-box";
    document.getElementById("assignmentHint").after(box);
  }
  const level = document.getElementById("assignmentLevel").value;
  const targetId = ensureOutcomeTargetId().value;
  if (level === "agent" || !targetId) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  const { agent, source } = outcomeResolvedAgent(level, targetId);
  if (agent) {
    box.innerHTML = `<span class="outcome-agent-found"><span>Credited to</span> <strong>${escapeHtml(agent.name)}</strong> <small>${escapeHtml(source)}</small></span>`;
    return;
  }
  const agents = state.agents.filter((item) => item.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = `<label><span>No agent found in these names — choose one <em>optional</em></span><select name="agentId"><option value="">Leave without agent</option>${agents.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>`;
}

function fillOutcomeTargets(preferred = "") {
  const level = document.getElementById("assignmentLevel").value;
  const target = document.getElementById("outcomeTarget");
  const label = groupLabels[level];
  const hiddenTarget = ensureOutcomeTargetId();
  const hierarchy = ensureOutcomeHierarchy();
  const targetWrapper = target.closest("label");
  document.getElementById("targetLabel").textContent = label;
  if (level !== "agent") {
    targetWrapper.classList.add("hidden");
    hierarchy.classList.remove("hidden");
    document.getElementById("outcomeAdSet").closest("label").classList.toggle("hidden", level === "campaign");
    document.getElementById("outcomeAd").closest("label").classList.toggle("hidden", level !== "ad");
    syncOutcomeHierarchy(preferredOutcomePath(level, preferred));
    document.getElementById("assignmentHint").textContent = level === "ad" ? "Choose campaign, then ad set, then exact ad so duplicate ad names stay separate." : level === "adSet" ? "Choose campaign first, then the ad set that produced the outcome." : "Choose the campaign that produced the outcome.";
    applyLanguage(document.getElementById("outcomeDialog"));
    return;
  }

  targetWrapper.classList.remove("hidden");
  hierarchy.classList.add("hidden");
  const options = targetOptions(level);
  target.replaceChildren(option(options.length ? `Select ${label.toLocaleLowerCase()}` : `No ${label.toLocaleLowerCase()} available`, ""));
  options.forEach((item) => target.append(option(item.label, item.id)));
  if (options.some((item) => item.id === preferred)) target.value = preferred;
  hiddenTarget.value = target.value;
  document.getElementById("assignmentHint").textContent = "Use when you only know the sales agent.";
  renderOutcomeAgentBox();
  applyLanguage(document.getElementById("outcomeDialog"));
}

function openOutcome({ level = "ad", targetId = "", type = "" } = {}) {
  const form = document.getElementById("outcomeForm");
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  if (form.elements.sourceDate) form.elements.sourceDate.value = "";
  form.elements.assignmentLevel.value = level;
  if (type && form.elements.type) form.querySelector(`input[name="type"][value="${CSS.escape(type)}"]`).checked = true;
  fillOutcomeTargets(targetId);
  applyLanguage(document.getElementById("outcomeDialog"));
  document.getElementById("outcomeDialog").showModal();
}

function ensureAgentDialog() {
  let dialog = document.getElementById("agentDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "agentDialog";
  dialog.className = "modal";
  dialog.innerHTML = `<form id="agentEditForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Sales agent</p><h2>Edit agent</h2><p>Saving rematches every imported ad set and campaign to its agent.</p></div><button class="icon-button" type="button" data-close-agent aria-label="Close agent form"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg></button></div><div class="form-grid"><label><span>Agent name</span><input name="name" required placeholder="Souad" autocomplete="off" /></label><label><span>WhatsApp <em>optional</em></span><input name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="+212 6..." /></label><label class="span-2"><span>Other spellings <em>comma-separated</em></span><input name="aliases" autocomplete="off" placeholder="Ex: hasan, hassane, حسن" /></label><label class="agent-active-toggle"><input type="hidden" name="active" value="false" /><input type="checkbox" name="active" value="true" /><span>Active (matched to ad sets)</span></label></div><p class="form-hint">Write the agent between quotes in the ad set or campaign name, for example <strong>Motion "hassan"</strong>. Spelling slips like "hasan" or "Hassane" still match. Without quotes, the name must appear as a word.</p><div class="modal-actions agent-modal-actions"><button class="button danger agent-delete" type="button" data-delete-agent="">Delete agent</button><button class="button secondary" type="button" data-close-agent>Cancel</button><button class="button primary" type="submit">Save agent</button></div></form>`;
  document.body.append(dialog);
  applyLanguage(dialog);
  return dialog;
}

function openAgentEditor(agentId) {
  const agent = byId(state.agents, agentId);
  if (!agent) return toast("Agent not found", "error");
  const dialog = ensureAgentDialog();
  const form = dialog.querySelector("form");
  editingAgentId = agent.id;
  form.reset();
  form.elements.name.value = agent.name || "";
  form.elements.whatsapp.value = agent.whatsapp || "";
  form.elements.aliases.value = (agent.aliases || []).join(", ");
  form.querySelector('input[type="checkbox"][name="active"]').checked = agent.active !== false;
  form.querySelector("[data-delete-agent]").dataset.deleteAgent = agent.id;
  applyLanguage(dialog);
  dialog.showModal();
  form.elements.name.focus();
}

function ensureOperationsDialogs() {
  if (document.getElementById("trainingDialog")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="trainingDialog" class="modal outcome-modal wide-modal"><form id="trainingForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Formation · تكوين</p><h2 id="trainingDialogTitle">Ajouter formation</h2><p>Nom, durée, rythme des séances et les prix.</p></div><button class="icon-button" type="button" data-close-training aria-label="Fermer">×</button></div><div class="form-grid"><label class="span-2"><span>Nom formation</span><input name="name" required placeholder="Comptabilité" autocomplete="off" /></label><label><span>Durée</span><input name="durationValue" type="number" min="0" step="1" placeholder="5" /></label><label><span>Unité</span><select name="durationUnit"><option value="months">Mois</option><option value="years">Années</option></select></label><label><span>Séances par semaine</span><input name="sessionsPerWeek" type="number" min="0" step="1" placeholder="3" /></label><label><span>Durée d'une séance (heures)</span><input name="sessionHours" type="number" min="0" step="0.5" placeholder="2" /></label></div><section class="payment-agreement-box"><div class="agreement-head"><div><p class="section-kicker">Prix · الأسعار</p><h3>Les trois prix de la formation</h3><p>Le prix mensuel est le prix principal. Le cash est le prix remisé payé en une fois.</p></div></div><div class="form-grid payment-grid"><label class="price-main"><span>Prix mensuel <em>principal</em></span><input name="monthlyPrice" type="number" min="0" step="0.01" placeholder="5000" /></label><label><span>Prix total (une fois)</span><input name="fullPrice" type="number" min="0" step="0.01" placeholder="4000" /></label><label><span>Prix cash / remisé</span><input name="discountedPrice" type="number" min="0" step="0.01" placeholder="3000" /></label></div></section><label class="switch-field"><input type="checkbox" name="nidamShift" /><span><strong>Nidam shift (matin + soir)</strong><small>La même séance est offerte le matin et le soir, l'étudiant vient quand il veut.</small></span></label><label><span>Notes <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Ce que la formation inclut"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-training>Annuler</button><button class="button primary" type="submit">Enregistrer formation</button></div></form></dialog>
    <dialog id="groupDialog" class="modal"><form id="groupForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Groupe · فوج</p><h2>Ajouter groupe</h2><p>Un groupe est juste un nom sous une formation. Les horaires se planifient ensuite sur le calendrier.</p></div><button class="icon-button" type="button" data-close-group aria-label="Fermer">×</button></div><div class="form-grid"><label class="span-2"><span>Formation</span><select id="groupProgram" name="programId" required></select></label><label class="span-2"><span>Nom du groupe</span><input name="name" placeholder="Groupe 1, Groupe 2, Groupe soir…" autocomplete="off" /></label><label><span>Capacité</span><input name="capacity" type="number" min="1" step="1" value="20" required /></label><label><span>Statut</span><select name="status"><option value="active">Actif</option><option value="full">Complet</option><option value="paused">Pause</option><option value="done">Terminé</option></select></label></div><div class="alert info" role="note"><strong>Après avoir créé le groupe</strong>, ouvrez l'assistant planning, choisissez ce groupe, et distribuez ses séances sur les créneaux disponibles du professeur.</div><label><span>Notes <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Salle, formateur, remarque"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-group>Annuler</button><button class="button primary" type="submit">Enregistrer groupe</button></div></form></dialog>
    <dialog id="studentDialog" class="modal outcome-modal wide-modal"><form id="studentForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Inscription étudiant · تسجيل</p><h2 id="studentDialogTitle">Inscrire étudiant</h2><p>Assignez l'étudiant au groupe et enregistrez l'accord de paiement exact.</p></div><button class="icon-button" type="button" data-close-student aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Nom étudiant</span><input name="name" required autocomplete="name" placeholder="Nom complet" /></label><label><span>Téléphone</span><input name="phone" inputmode="tel" autocomplete="tel" placeholder="+212 6..." /></label><label class="span-2"><span>Formation choisie</span><select id="studentTrainingPick"><option value="">Toutes les formations</option></select></label></div><section id="studentSpotsMap" class="spots-map span-2"></section><div class="form-grid"><label class="span-2"><span>Groupe (séance principale)</span><select id="studentGroup" name="groupId" required></select><small class="field-note">Choisissez une séance disponible ci-dessus, ou sélectionnez ici. L'étudiant peut assister à n'importe quelle séance de la même formation, même dans un autre groupe.</small></label><label><span>Agent commercial</span><select id="studentAgent" name="agentId"></select></label><label><span>Date inscription</span><input name="registeredAt" type="date" required /></label><label><span>Statut</span><select name="status"><option value="registered">Inscrit</option><option value="active">Actif</option><option value="completed">Terminé</option><option value="paused">Pause</option><option value="cancelled">Annulé</option></select></label></div><section class="payment-agreement-box"><div class="agreement-head"><div><p class="section-kicker">Accord paiement</p><h3>Comment l'étudiant va payer</h3><p id="paymentPlanHelp">Choisissez cash, mensuel, ou un accord spécial.</p></div></div><div class="payment-choice-grid" role="radiogroup" aria-label="Mode paiement"><label class="payment-choice"><input type="radio" name="paymentPlan" value="paid_full" checked /><span><strong>Payé full / Cash</strong><small>Prix cash quand il paie tout le cours.</small></span></label><label class="payment-choice"><input type="radio" name="paymentPlan" value="monthly" /><span><strong>Paiement mensuel</strong><small>Total plus élevé, payé chaque mois.</small></span></label><label class="payment-choice"><input type="radio" name="paymentPlan" value="custom" /><span><strong>Accord spécial</strong><small>Ex: 1500 maintenant, reste le mois prochain.</small></span></label></div><div class="form-grid payment-grid"><label><span>Prix convenu total</span><input name="totalDue" type="number" min="0" step="0.01" required /></label><label id="initialPaymentField"><span>Payé maintenant</span><input name="initialPaid" type="number" min="0" step="0.01" placeholder="0" /></label><label><span>Date départ paiement</span><input name="paymentStartDate" type="date" /></label><label data-payment-field="monthly"><span>Montant chaque mois</span><input name="installmentAmount" type="number" min="0" step="0.01" placeholder="1000" /></label><label data-payment-field="monthly"><span>Nombre de mois</span><input name="installmentsCount" type="number" min="0" step="1" placeholder="5" /></label><label data-payment-field="next"><span>Prochain paiement</span><input name="nextPaymentDate" type="date" /></label></div><label data-payment-field="custom"><span>Accord spécial <em>optionnel</em></span><textarea name="agreementNote" rows="2" placeholder="Ex: total 3000, il paie 1500 maintenant et 1500 le mois prochain"></textarea></label></section><label><span>Notes étudiant <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Documents, remarques, besoin particulier"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-student>Annuler</button><button class="button primary" type="submit">Enregistrer étudiant</button></div></form></dialog>
    <dialog id="paymentDialog" class="modal"><form id="paymentForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Paiement · أداء</p><h2>Ajouter paiement</h2><p id="paymentStudentName">Enregistrer un paiement étudiant.</p></div><button class="icon-button" type="button" data-close-payment aria-label="Fermer">×</button></div><div class="form-grid"><label><span>Montant</span><input name="amount" type="number" min="0.01" step="0.01" required /></label><label><span>Date paiement</span><input name="paidAt" type="date" required /></label><label><span>Méthode</span><select name="method"><option value="cash">Espèces</option><option value="transfer">Virement</option><option value="card">Carte</option><option value="other">Autre</option></select></label><label><span>Prochain paiement <em>optionnel</em></span><input name="nextPaymentDate" type="date" /></label></div><label><span>Note <em>optionnel</em></span><textarea name="notes" rows="2" placeholder="Reçu, tranche, rappel"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-close-payment>Annuler</button><button class="button primary" type="submit">Enregistrer paiement</button></div></form></dialog>
    <dialog id="studentDetailDialog" class="modal outcome-modal"><div class="modal-content"><div class="modal-head"><div><p class="section-kicker">Historique étudiant · تتبع</p><h2 id="studentDetailTitle">Historique étudiant</h2><p>Inscription, modifications et paiements dans une seule trace.</p></div><button class="icon-button" type="button" data-close-student-detail aria-label="Fermer">×</button></div><div id="studentDetailBody"></div><div class="modal-actions"><button class="button secondary" type="button" data-close-student-detail>Fermer</button></div></div></dialog>
  `);
  applyLanguage(document.getElementById("trainingDialog"));
  applyLanguage(document.getElementById("groupDialog"));
  applyLanguage(document.getElementById("studentDialog"));
  applyLanguage(document.getElementById("paymentDialog"));
  applyLanguage(document.getElementById("studentDetailDialog"));
}

function hydrateGroupProgramSelect() {
  const select = document.getElementById("groupProgram");
  select.replaceChildren(option("Choisir formation", ""));
  state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => select.append(option(`${program.name}${program.durationLabel ? ` - ${program.durationLabel}` : ""}`, program.id)));
}


// True if the teacher is available for a group's main session day/time.
function groupTeacherAvailable(group) {
  const sessions = groupSessions(group);
  if (!sessions.length) return true;
  return sessions.some((session) => isSlotAvailable(session.day, session.timeStart, session.timeEnd));
}
// Visual map of every group/session for the chosen training, with free spots and teacher availability.
function renderStudentSpotsMap(trainingId = "", selectedGroupId = "") {
  const container = document.getElementById("studentSpotsMap");
  if (!container) return;
  const groups = state.groups
    .filter((group) => group.status !== "done" && (!trainingId || group.programId === trainingId))
    .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || "") || a.name.localeCompare(b.name));
  if (!groups.length) {
    container.innerHTML = trainingId
      ? '<div class="empty">Aucune séance pour cette formation. Créez un groupe dans l\'assistant planning.</div>'
      : '<div class="empty">Choisissez une formation pour voir les séances disponibles.</div>';
    applyLanguage(container);
    return;
  }
  const cards = groups.map((group) => {
    const stats = groupStats(group);
    const training = groupTraining(group);
    const full = stats.spots <= 0;
    const available = groupTeacherAvailable(group);
    const blocked = !available;
    const selected = group.id === selectedGroupId;
    const statusPill = full
      ? '<span class="status-pill quality-weak">COMPLET</span>'
      : blocked
        ? '<span class="status-pill quality-weak">Prof non disponible</span>'
        : `<span class="status-pill quality-strong">${stats.spots} places libres</span>`;
    const disabledClass = full || blocked ? "disabled" : "";
    const clickAttr = full || blocked ? "" : `data-pick-spot="${escapeHtml(group.id)}"`;
    return `<button type="button" class="spot-card ${disabledClass} ${selected ? "selected" : ""}" ${clickAttr} ${full || blocked ? "aria-disabled=\"true\"" : ""}>
      <div class="spot-card-head"><strong>${escapeHtml(group.name)}</strong>${statusPill}</div>
      <small>${escapeHtml(training?.name || "Formation")}</small>
      <small class="spot-schedule">${escapeHtml(groupSchedule(group))}</small>
      <div class="spot-capacity"><span class="capacity-bar"><i style="width:${stats.fullness}%"></i></span><small>${number(stats.enrolled)}/${number(stats.capacity)}</small></div>
    </button>`;
  }).join("");
  container.innerHTML = `<div class="spots-map-head"><p class="section-kicker">Places disponibles</p><small>Vert = places libres. Cliquez une séance pour l'assigner.</small></div><div class="spots-grid">${cards}</div>`;
  applyLanguage(container);
}

function hydrateStudentSelects(preferredGroupId = "") {
  const groupSelect = document.getElementById("studentGroup");
  const agentSelect = document.getElementById("studentAgent");
  groupSelect.replaceChildren(option("Choisir groupe", ""));
  // Group the options by training so the agent sees every group/session of the same
  // training together and can place the student into any of them (cross-group drop-in).
  const byTraining = new Map();
  state.groups.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((group) => {
    const trainingId = group.programId || "none";
    if (!byTraining.has(trainingId)) byTraining.set(trainingId, []);
    byTraining.get(trainingId).push(group);
  });
  [...byTraining.entries()]
    .sort((a, b) => (byId(state.programs, a[0])?.name || "").localeCompare(byId(state.programs, b[0])?.name || ""))
    .forEach(([trainingId, groups]) => {
      const training = byId(state.programs, trainingId);
      const optgroup = document.createElement("optgroup");
      optgroup.label = training?.name || "Sans formation";
      groups.forEach((group) => {
        const stats = groupStats(group);
        const opt = option(`${group.name} · ${groupSchedule(group)} · ${stats.spots > 0 ? `${stats.spots} places` : "COMPLET"}`, group.id);
        if (stats.spots <= 0 && group.id !== preferredGroupId) opt.disabled = true;
        optgroup.append(opt);
      });
      groupSelect.append(optgroup);
    });
  if (preferredGroupId && state.groups.some((group) => group.id === preferredGroupId)) groupSelect.value = preferredGroupId;
  // Training picker drives the visual "available spots" map.
  const trainingPick = document.getElementById("studentTrainingPick");
  if (trainingPick) {
    const preferredTrainingId = groupTraining(byId(state.groups, preferredGroupId))?.id || "";
    trainingPick.replaceChildren(option("Toutes les formations", ""));
    state.programs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((program) => trainingPick.append(option(program.name, program.id)));
    trainingPick.value = preferredTrainingId;
    renderStudentSpotsMap(preferredTrainingId, groupSelect.value);
  }
  const agentLabel = agentSelect.closest("label");
  if (currentUser?.role === "sales") {
    agentSelect.replaceChildren(option(currentUser.agentName || currentUser.label || "Agent connecté", currentUser.agentId || ""));
    agentSelect.value = currentUser.agentId || "";
    agentLabel?.classList.add("hidden");
    return;
  }
  agentLabel?.classList.remove("hidden");
  agentSelect.replaceChildren(option("Non assigné", ""));
  state.agents.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((agent) => agentSelect.append(option(agent.name, agent.id)));
}

function paymentPlanHelpText(plan) {
  const normalized = normalizePaymentPlanUi(plan);
  if (normalized === "monthly") return "Use this when the student pays a higher total split month by month.";
  if (normalized === "custom") return "Use this for exceptions: choose the total deal, what they paid now, and the exact next follow-up date.";
  return "Use this when the student pays the whole course price now, usually the cash discount.";
}

function syncStudentPaymentFields({ resetDefaults = false } = {}) {
  const form = document.getElementById("studentForm");
  if (!form) return;
  const plan = normalizePaymentPlanUi(form.elements.paymentPlan?.value);
  const group = byId(state.groups, form.elements.groupId?.value);
  const registeredAt = form.elements.registeredAt?.value || todayInput();
  const paymentStartDate = form.elements.paymentStartDate?.value || registeredAt;
  const months = durationMonthsFor(group);
  const totalInput = form.elements.totalDue;
  const initialPaidInput = form.elements.initialPaid;
  const installmentInput = form.elements.installmentAmount;
  const countInput = form.elements.installmentsCount;
  const nextDateInput = form.elements.nextPaymentDate;
  const help = document.getElementById("paymentPlanHelp");

  form.querySelectorAll("[data-payment-field]").forEach((field) => {
    const target = field.dataset.paymentField;
    const show = target === "monthly" ? plan === "monthly" : target === "custom" ? plan === "custom" : plan !== "paid_full";
    field.classList.toggle("hidden", !show);
  });
  form.querySelectorAll(".payment-choice").forEach((choice) => choice.classList.toggle("active", Boolean(choice.querySelector("input")?.checked)));
  if (help) help.textContent = paymentPlanHelpText(plan);
  if (form.elements.paymentStartDate && !form.elements.paymentStartDate.value) form.elements.paymentStartDate.value = registeredAt;

  if (resetDefaults && group && !editingStudentId) {
    const suggested = defaultPriceForPlan(group, plan);
    if (totalInput) totalInput.value = suggested ? suggested.toFixed(2) : "";
    if (plan === "paid_full" && initialPaidInput) initialPaidInput.value = totalInput?.value || "";
    if (plan === "monthly") {
      if (countInput) countInput.value = months || "";
      const monthly = months ? Number(totalInput?.value || 0) / months : 0;
      if (installmentInput) installmentInput.value = monthly ? monthly.toFixed(2) : "";
      if (nextDateInput) nextDateInput.value = addMonthsInput(paymentStartDate, 1);
    }
    if (plan === "custom") {
      if (initialPaidInput && !initialPaidInput.value) initialPaidInput.value = "";
      if (nextDateInput && !nextDateInput.value) nextDateInput.value = addMonthsInput(registeredAt, 1);
      if (installmentInput) installmentInput.value = "";
      if (countInput) countInput.value = "";
    }
  }

  if (plan === "paid_full") {
    if (nextDateInput) nextDateInput.value = "";
    if (installmentInput) installmentInput.value = "";
    if (countInput) countInput.value = "";
  }
  if (plan === "monthly" && !editingStudentId) {
    if (countInput && !countInput.value && months) countInput.value = months;
    if (installmentInput && !installmentInput.value && Number(totalInput?.value || 0) && Number(countInput?.value || 0)) {
      installmentInput.value = (Number(totalInput.value) / Number(countInput.value)).toFixed(2);
    }
    if (nextDateInput && !nextDateInput.value) nextDateInput.value = addMonthsInput(paymentStartDate, 1);
  }
  applyLanguage(document.getElementById("studentDialog"));
}

function setStudentDefaultPrice({ resetDefaults = true } = {}) {
  if (editingStudentId) {
    syncStudentPaymentFields({ resetDefaults: false });
    return;
  }
  syncStudentPaymentFields({ resetDefaults });
}

let editingTrainingId = "";
function openTrainingForm({ trainingId = "" } = {}) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  const training = trainingId ? byId(state.programs, trainingId) : null;
  editingTrainingId = training?.id || "";
  const form = document.getElementById("trainingForm");
  form.reset();
  document.getElementById("trainingDialogTitle").textContent = training ? "Modifier formation" : "Ajouter formation";
  if (training) {
    form.elements.name.value = training.name || "";
    form.elements.durationValue.value = training.durationValue || "";
    form.elements.durationUnit.value = training.durationUnit || "months";
    form.elements.sessionsPerWeek.value = training.sessionsPerWeek || "";
    form.elements.sessionHours.value = training.sessionHours || "";
    form.elements.monthlyPrice.value = training.monthlyPrice ? Number(training.monthlyPrice).toFixed(2) : "";
    form.elements.fullPrice.value = training.fullPrice ? Number(training.fullPrice).toFixed(2) : "";
    form.elements.discountedPrice.value = training.discountedPrice ? Number(training.discountedPrice).toFixed(2) : "";
    form.elements.nidamShift.checked = Boolean(training.nidamShift);
    form.elements.notes.value = training.notes || "";
  } else {
    form.elements.name.value = document.getElementById("plannerTrainingName")?.value.trim() || "";
    const plannerDuration = document.getElementById("plannerDuration")?.value.trim() || "";
    const plannerMonths = plannerDuration.match(/\d+/);
    if (plannerMonths) form.elements.durationValue.value = plannerMonths[0];
  }
  applyLanguage(document.getElementById("trainingDialog"));
  document.getElementById("trainingDialog").showModal();
  form.elements.name.focus();
}

function openGroupForm(prefill = {}) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  if (!state.programs.length) return toast("Ajoutez une formation avant de créer un groupe", "error");
  const form = document.getElementById("groupForm");
  hydrateGroupProgramSelect();
  form.reset();
  form.elements.capacity.value = prefill.capacity || 20;
  form.elements.programId.value = prefill.programId || "";
  applyLanguage(document.getElementById("groupDialog"));
  document.getElementById("groupDialog").showModal();
  (form.elements.programId.value ? form.elements.name : form.elements.programId).focus();
}

function openStudentForm({ studentId = "", groupId = "" } = {}) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  if (!state.groups.length) return toast("Ajoutez un groupe avant d'inscrire des étudiants", "error");
  const form = document.getElementById("studentForm");
  const student = byId(state.students, studentId);
  editingStudentId = student?.id || "";
  form.reset();
  hydrateStudentSelects(groupId || student?.groupId || "");
  document.getElementById("studentDialogTitle").textContent = student ? "Modifier étudiant" : "Inscrire étudiant";
  document.getElementById("initialPaymentField").classList.toggle("hidden", Boolean(student));
  form.elements.registeredAt.value = student?.registeredAt || todayInput();
  form.elements.status.value = student?.status || "registered";
  form.elements.paymentPlan.value = normalizePaymentPlanUi(student?.paymentPlan || "paid_full");
  if (student) {
    form.elements.name.value = student.name || "";
    form.elements.phone.value = student.phone || "";
    form.elements.groupId.value = student.groupId || "";
    form.elements.agentId.value = student.agentId || "";
    form.elements.totalDue.value = Number(student.totalDue || 0).toFixed(2);
    form.elements.installmentAmount.value = student.installmentAmount ? Number(student.installmentAmount).toFixed(2) : "";
    form.elements.installmentsCount.value = student.installmentsCount || "";
    form.elements.paymentStartDate.value = student.paymentStartDate || student.registeredAt || todayInput();
    form.elements.nextPaymentDate.value = student.nextPaymentDate || "";
    form.elements.agreementNote.value = student.agreementNote || "";
    form.elements.notes.value = student.notes || "";
    syncStudentPaymentFields({ resetDefaults: false });
  } else {
    form.elements.paymentStartDate.value = form.elements.registeredAt.value;
    setStudentDefaultPrice({ resetDefaults: true });
  }
  applyLanguage(document.getElementById("studentDialog"));
  document.getElementById("studentDialog").showModal();
  form.elements.name.focus();
}

function openPaymentForm(studentId) {
  ensureOperationsDialogs();
  if (!studentDataUnlocked()) return;
  const student = byId(state.students, studentId);
  if (!student) return toast("Étudiant introuvable", "error");
  paymentStudentId = student.id;
  const form = document.getElementById("paymentForm");
  form.reset();
  form.elements.paidAt.value = todayInput();
  const remaining = studentRemaining(student);
  const plan = normalizePaymentPlanUi(student.paymentPlan);
  const suggestedAmount = plan === "monthly" && student.installmentAmount
    ? Math.min(remaining, Number(student.installmentAmount || 0))
    : remaining;
  form.elements.amount.value = suggestedAmount ? suggestedAmount.toFixed(2) : "";
  if (form.elements.nextPaymentDate) {
    form.elements.nextPaymentDate.value = remaining - suggestedAmount > 0
      ? (student.nextPaymentDate || (plan === "monthly" ? addMonthsInput(form.elements.paidAt.value, 1) : ""))
      : "";
  }
  document.getElementById("paymentStudentName").textContent = `${student.name} - reste ${money(studentRemaining(student))}`;
  applyLanguage(document.getElementById("paymentDialog"));
  document.getElementById("paymentDialog").showModal();
  form.elements.amount.focus();
}

function syncPaymentFormNextDate() {
  const form = document.getElementById("paymentForm");
  const student = byId(state.students, paymentStudentId);
  if (!form || !student || !form.elements.nextPaymentDate) return;
  const remainingAfterPayment = studentRemaining(student) - Number(form.elements.amount?.value || 0);
  if (remainingAfterPayment <= 0) {
    form.elements.nextPaymentDate.value = "";
    return;
  }
  if (normalizePaymentPlanUi(student.paymentPlan) === "monthly" && !form.elements.nextPaymentDate.value) {
    form.elements.nextPaymentDate.value = addMonthsInput(form.elements.paidAt?.value || todayInput(), 1);
  }
}

function eventDescription(event) {
  if (event.type === "registered") return `Inscrit avec prix convenu ${money(event.details?.totalDue || 0)}`;
  if (event.type === "payment_added") return `Paiement enregistré: ${money(event.details?.amount || 0)} le ${escapeHtml(event.details?.paidAt || "")}`;
  if (event.type === "updated") return "Détails étudiant modifiés";
  return event.type.replaceAll("_", " ");
}

// Quick PATCH from the student management view (transfer group / change status),
// then refresh the open view in place so the agent stays in context.
async function quickUpdateStudent(studentId, patch, successMessage) {
  if (!studentDataUnlocked()) return;
  try {
    await api(`/api/students/${studentId}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
    if (detailStudentId === studentId) openStudentDetail(studentId);
    toast(successMessage);
  } catch (error) {
    toast(error.message, "error");
    if (detailStudentId === studentId) openStudentDetail(studentId); // revert the control
  }
}
function openStudentDetail(studentId) {
  ensureOperationsDialogs();
  const student = byId(state.students, studentId);
  if (!student) return toast("Étudiant introuvable", "error");
  detailStudentId = student.id;
  const group = studentGroup(student);
  const training = studentTraining(student);
  const agent = byId(state.agents, student.agentId);
  const payments = state.payments.filter((payment) => payment.studentId === student.id).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const events = state.events.filter((event) => event.studentId === student.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById("studentDetailTitle").textContent = student.name;
  const paid = studentPaid(student);
  const total = Number(student.totalDue || 0);
  const remaining = studentRemaining(student);
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (paid > 0 ? 100 : 0);
  const dueStatus = paymentDueStatus(student);
  const fullyPaid = remaining <= 0;
  // Groups of the SAME training first (natural transfers), then everything else.
  const sameTrainingGroups = state.groups.filter((g) => g.programId === student.programId);
  const otherGroups = state.groups.filter((g) => g.programId !== student.programId);
  const groupOption = (g) => {
    const s = groupStats(g);
    const full = s.spots <= 0 && g.id !== student.groupId;
    return `<option value="${escapeHtml(g.id)}" ${g.id === student.groupId ? "selected" : ""} ${full ? "disabled" : ""}>${escapeHtml(g.name)} · ${escapeHtml(groupSchedule(g))} · ${full ? "COMPLET" : `${s.spots} places`}</option>`;
  };
  const statuses = [["registered", "Inscrit"], ["active", "Actif"], ["paused", "Pause"], ["completed", "Terminé"], ["cancelled", "Annulé"]];

  const progressBlock = `<section class="student-progress ${fullyPaid ? "is-paid" : ""}">
    <div class="student-progress-top"><div><p class="section-kicker">Paiement</p><h3>${money(paid)} <span>/ ${money(total)}</span></h3></div><div class="student-progress-remaining"><span>Reste</span><strong>${money(remaining)}</strong></div></div>
    <div class="progress-track" role="img" aria-label="${percent}% payé"><i style="width:${percent}%"></i></div>
    <div class="student-progress-foot"><span class="status-pill ${dueStatus.className}">${escapeHtml(dueStatus.label)}</span><small>${escapeHtml(dueStatus.detail)}</small><small>${escapeHtml(paymentPlanLabel(student))}${student.agreementNote ? " · " + escapeHtml(student.agreementNote) : ""}</small></div>
  </section>`;

  const actionsBlock = `<div class="student-actions">
    <button class="button primary" type="button" data-add-payment="${escapeHtml(student.id)}" ${fullyPaid ? "disabled" : ""}>+ Ajouter paiement</button>
    <button class="button secondary" type="button" data-edit-current-student>Modifier détails</button>
    ${currentUser?.role === "admin" ? `<button class="button danger" type="button" data-delete-student="${escapeHtml(student.id)}">Supprimer l'étudiant</button>` : ""}
  </div>
  <div class="student-quick-grid">
    <label><span>Transférer vers un groupe</span><select data-transfer-group="${escapeHtml(student.id)}"><optgroup label="Même formation">${sameTrainingGroups.map(groupOption).join("")}</optgroup>${otherGroups.length ? `<optgroup label="Autres formations">${otherGroups.map(groupOption).join("")}</optgroup>` : ""}</select></label>
    <label><span>Changer le statut</span><select data-change-status="${escapeHtml(student.id)}">${statuses.map(([value, label]) => `<option value="${value}" ${student.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
  </div>`;

  const infoBlock = `<div class="student-detail-grid"><article class="mini-ledger"><span>Formation</span><strong>${escapeHtml(training?.name || "Inconnue")}</strong><small>${escapeHtml(group?.name || "Sans groupe")} - ${escapeHtml(group ? groupSchedule(group) : "")}</small></article><article class="mini-ledger"><span>Agent commercial</span><strong>${escapeHtml(agent?.name || "Non assigné")}</strong><small>${escapeHtml(student.phone || "Sans téléphone")}</small></article><article class="mini-ledger"><span>Inscrit le</span><strong>${escapeHtml(student.registeredAt || "-")}</strong><small>${escapeHtml(statuses.find(([v]) => v === student.status)?.[1] || student.status)}</small></article></div>`;

  document.getElementById("studentDetailBody").innerHTML = `${progressBlock}${actionsBlock}${infoBlock}<h3>Historique paiements</h3><div class="simple-list">${payments.length ? payments.map((payment) => `<div class="simple-list-row"><div><strong>${money(payment.amount)}</strong><small>${escapeHtml(payment.paidAt)} - ${escapeHtml(payment.method || "cash")}</small></div><span>${escapeHtml(payment.notes || "")}</span></div>`).join("") : '<div class="empty">Aucun paiement enregistré.</div>'}</div><h3>Trace complète</h3><ol class="timeline">${events.length ? events.map((event) => `<li><strong>${escapeHtml(eventDescription(event))}</strong><small>${escapeHtml(new Date(event.createdAt).toLocaleString())}</small></li>`).join("") : '<li><strong>Ancien dossier étudiant</strong><small>Aucun événement enregistré.</small></li>'}</ol>`;
  applyLanguage(document.getElementById("studentDetailDialog"));
  if (!document.getElementById("studentDetailDialog").open) document.getElementById("studentDetailDialog").showModal();
}

function selectMetaFile(file) {
  if (!file) return;
  if (!file.name.toLocaleLowerCase().endsWith(".csv")) return toast("Choose the CSV version of your Meta report", "error");
  if (file.size > 9_000_000) return toast("The CSV is larger than 9 MB", "error");
  pendingMetaFile = file;
  const selected = document.getElementById("selectedFile");
  selected.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${number(file.size / 1024)} KB · ready to import</span>`;
  selected.classList.remove("hidden");
  document.getElementById("importCsvButton").disabled = false;
}

function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"], button:not([type])');
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Saving…"; }
  try {
    if (form.id === "outcomeForm") {
      const payload = formPayload(form);
      if (!payload.targetId) throw new Error("Choose where this outcome came from");
      await api("/api/outcomes", { method: "POST", body: JSON.stringify(payload) });
      document.getElementById("outcomeDialog").close();
      await load(); toast("Outcome saved");
    } else if (form.id === "trainingForm") {
      const payload = formPayload(form);
      payload.nidamShift = form.elements.nidamShift.checked;
      const route = editingTrainingId ? `/api/programs/${editingTrainingId}` : "/api/programs";
      await api(route, { method: editingTrainingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      document.getElementById("trainingDialog").close();
      editingTrainingId = "";
      await load(); toast("Training saved");
    } else if (form.id === "groupForm") {
      await api("/api/groups", { method: "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("groupDialog").close();
      await load(); toast("Group saved");
    } else if (form.id === "studentForm") {
      const payload = formPayload(form);
      const route = editingStudentId ? `/api/students/${editingStudentId}` : "/api/students";
      await api(route, { method: editingStudentId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      editingStudentId = "";
      document.getElementById("studentDialog").close();
      await load(); toast("Student saved");
    } else if (form.id === "paymentForm") {
      if (!paymentStudentId) throw new Error("Choose a student first");
      const paidStudentId = paymentStudentId;
      await api(`/api/students/${paidStudentId}/payments`, { method: "POST", body: JSON.stringify(formPayload(form)) });
      paymentStudentId = "";
      document.getElementById("paymentDialog").close();
      await load();
      // If the student management view is open for this student, refresh it in place.
      if (document.getElementById("studentDetailDialog")?.open && detailStudentId === paidStudentId) openStudentDetail(paidStudentId);
      toast("Payment saved");
    } else if (form.id === "goalForm") {
      const route = editingGoalId ? `/api/goals/${editingGoalId}` : "/api/goals";
      const goal = await api(route, { method: editingGoalId ? "PATCH" : "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("goalDialog").close();
      editingGoalId = "";
      activeGoalId = goal.id; localStorage.setItem("cmcg-active-goal", goal.id);
      await load(); toast("Objectif enregistré");
    } else if (form.id === "manualBudgetForm") {
      const payload = formPayload(form);
      const range = manualBudgetPresetRange(document.getElementById("manualBudgetPreset")?.value || "today");
      if (range) { payload.from = range.from; payload.to = range.to; }
      await api("/api/manual-budget", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      syncManualBudgetDates();
      hydrateManualBudgetTarget();
      await load(); toast("Budget ajouté");
    } else if (form.id === "agentEditForm") {
      if (!editingAgentId) throw new Error("Choose an agent to edit");
      await api(`/api/agents/${editingAgentId}`, { method: "PATCH", body: JSON.stringify(formPayload(form)) });
      editingAgentId = "";
      document.getElementById("agentDialog").close();
      await load(); toast("Agent updated and ad sets rematched");
    } else if (form.dataset.create === "agents") {
      await api("/api/agents", { method: "POST", body: JSON.stringify(formPayload(form)) });
      form.reset(); await load(); toast("Agent added and ad sets rematched");
    }
  } catch (error) { toast(error.message, "error"); }
  finally { if (button) { button.disabled = false; button.textContent = original; } }
});

document.addEventListener("click", async (event) => {
  const tab = event.target.closest(".tab");
  if (tab) showPanel(tab.dataset.tab);
  const tabLink = event.target.closest("[data-tab-link]");
  if (tabLink) showPanel(tabLink.dataset.tabLink);
  if (event.target.closest("[data-open-import]")) { showPanel("data"); setTimeout(() => document.getElementById("metaCsvFile").focus(), 250); }
  if (event.target.closest("[data-go-performance]")) showPanel("performance");
  if (event.target.closest("#openResetData")) document.getElementById("resetDataDialog").showModal();
  if (event.target.closest("[data-open-training]")) openTrainingForm();
  if (event.target.closest("[data-open-goal]")) openGoalForm();
  if (event.target.closest("[data-print-report]")) { if (!reportAgentId) return toast("Choisissez un agent d'abord", "error"); window.print(); return; }
  if (event.target.closest("[data-close-goal]")) document.getElementById("goalDialog")?.close();
  const editGoal = event.target.closest("[data-edit-goal]");
  if (editGoal) { event.stopPropagation(); openGoalForm({ goalId: editGoal.dataset.editGoal }); return; }
  const deleteGoal = event.target.closest("[data-delete-goal]");
  if (deleteGoal) {
    event.stopPropagation();
    if (confirm("Supprimer cet objectif ?")) {
      try { await api(`/api/goals/${deleteGoal.dataset.deleteGoal}`, { method: "DELETE" }); if (activeGoalId === deleteGoal.dataset.deleteGoal) { activeGoalId = ""; localStorage.setItem("cmcg-active-goal", ""); } await load(); toast("Objectif supprimé"); }
      catch (error) { toast(error.message, "error"); }
    }
    return;
  }
  const goalChip = event.target.closest("[data-goal]");
  if (goalChip) {
    activeGoalId = goalChip.dataset.goal;
    localStorage.setItem("cmcg-active-goal", activeGoalId);
    renderGoals(); renderOverviewChart(); renderKpis();
    return;
  }
  if (event.target.closest("[data-open-group]")) openGroupForm();
  const plannerViewBtn = event.target.closest("[data-planner-view]");
  if (plannerViewBtn) {
    plannerView = plannerViewBtn.dataset.plannerView === "availability" ? "availability" : "plan";
    document.querySelectorAll("[data-planner-view]").forEach((btn) => btn.classList.toggle("active", btn === plannerViewBtn));
    document.getElementById("availabilityHint")?.classList.toggle("hidden", plannerView !== "availability");
    renderPlannerSuggestions();
    document.getElementById("plannerSuggestions")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const availabilityToggle = event.target.closest("[data-toggle-availability]");
  if (availabilityToggle) {
    await toggleAvailability(availabilityToggle.dataset.day, availabilityToggle.dataset.start, availabilityToggle.dataset.end);
    return;
  }
  const sessionToggle = event.target.closest("[data-toggle-session]");
  if (sessionToggle) {
    await toggleGroupSession(sessionToggle.dataset.group, sessionToggle.dataset.day, sessionToggle.dataset.start, sessionToggle.dataset.end);
    return;
  }
  const autoDistribute = event.target.closest("[data-auto-distribute]");
  if (autoDistribute) {
    const group = byId(state.groups, sessionsGroupId);
    if (!group) return toast("Choisissez un groupe", "error");
    if (!studentDataUnlocked()) return;
    try {
      await saveGroupSessions(group, autoDistributeSessions(group));
      renderPlannerSuggestions();
      renderGroupCards();
      toast("Séances distribuées. Vérifiez et ajustez si besoin.");
    } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (event.target.closest("[data-run-planner]")) {
    renderPlannerSuggestions();
    document.getElementById("plannerSuggestions")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const seedScreenshot = event.target.closest("[data-seed-screenshot]");
  if (seedScreenshot) {
    if (!studentDataUnlocked()) return;
    const button = seedScreenshot;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Chargement...";
    try {
      const result = await api("/api/operations/seed-screenshot-schedule", { method: "POST", body: JSON.stringify({ source: "screenshot" }) });
      await load();
      toast(`${result.result.programsAdded} formations et ${result.result.groupsAdded} groupes chargés depuis l'image.`);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }
  const plannerDay = event.target.closest("[data-planner-day]");
  if (plannerDay) {
    plannerSelectedDay = plannerDay.dataset.plannerDay || "monday";
    localStorage.setItem("cmcg-planner-day", plannerSelectedDay);
    renderPlannerSuggestions();
    document.querySelector(".planner-day-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  const createPlan = event.target.closest("[data-create-plan]");
  if (createPlan) {
    const button = createPlan;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Création...";
    try { await createSuggestedPlan(button.dataset.createPlan); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = original; }
  }
  const openStudent = event.target.closest("[data-open-student]");
  if (openStudent) openStudentForm({ groupId: openStudent.dataset.group || "" });
  const pickSpot = event.target.closest("[data-pick-spot]");
  if (pickSpot) {
    const groupSelect = document.getElementById("studentGroup");
    if (groupSelect) {
      groupSelect.value = pickSpot.dataset.pickSpot;
      setStudentDefaultPrice({ resetDefaults: true });
      renderStudentSpotsMap(document.getElementById("studentTrainingPick")?.value || "", groupSelect.value);
    }
    return;
  }
  if (event.target.closest("[data-close-training]")) document.getElementById("trainingDialog")?.close();
  if (event.target.closest("[data-close-group]")) document.getElementById("groupDialog")?.close();
  if (event.target.closest("[data-close-student]")) { editingStudentId = ""; document.getElementById("studentDialog")?.close(); }
  if (event.target.closest("[data-close-payment]")) { paymentStudentId = ""; document.getElementById("paymentDialog")?.close(); }
  if (event.target.closest("[data-close-student-detail]")) document.getElementById("studentDetailDialog")?.close();
  const viewGroup = event.target.closest("[data-view-group]");
  if (viewGroup) {
    const group = byId(state.groups, viewGroup.dataset.viewGroup);
    if (group) {
      operationsFilters.trainingId = group.programId || "";
      operationsFilters.timing = `${group.timeStart}-${group.timeEnd}`;
      operationsFilters.search = group.name || "";
      renderOperations();
      document.getElementById("studentRows")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  const addPayment = event.target.closest("[data-add-payment]");
  if (addPayment) openPaymentForm(addPayment.dataset.addPayment);
  const editStudent = event.target.closest("[data-edit-student]");
  if (editStudent) openStudentForm({ studentId: editStudent.dataset.editStudent });
  const deleteStudent = event.target.closest("[data-delete-student]");
  if (deleteStudent) {
    const student = byId(state.students, deleteStudent.dataset.deleteStudent);
    if (student && confirm(`Supprimer définitivement ${student.name} ? Cela efface l'étudiant, ses paiements et son historique. Action irréversible.`)) {
      try {
        await api(`/api/students/${student.id}`, { method: "DELETE" });
        document.getElementById("studentDetailDialog")?.close();
        detailStudentId = "";
        await load(); toast("Étudiant supprimé");
      } catch (error) { toast(error.message, "error"); }
    }
    return;
  }
  const studentsTrainingCard = event.target.closest("[data-students-training]");
  if (studentsTrainingCard) {
    studentsFilters.trainingId = studentsTrainingCard.dataset.studentsTraining;
    studentsFilters.groupId = ""; // reset group when training changes
    renderStudentsPage();
    return;
  }
  const studentDetail = event.target.closest("[data-student-detail]");
  if (studentDetail) openStudentDetail(studentDetail.dataset.studentDetail);
  if (event.target.closest("[data-edit-current-student]")) {
    document.getElementById("studentDetailDialog")?.close();
    openStudentForm({ studentId: detailStudentId });
  }
  const chartMetric = event.target.closest("[data-chart-metric]");
  if (chartMetric) {
    activeChartMetric = chartMetric.dataset.chartMetric;
    localStorage.setItem("cmcg-chart-metric", activeChartMetric);
    renderOverviewChart(); renderKpis();
    return;
  }
  const kpiMetric = event.target.closest("[data-kpi-metric]");
  if (kpiMetric) {
    // A KPI card selects the metric shown on the exact-value graph.
    activeChartMetric = kpiMetric.dataset.kpiMetric;
    localStorage.setItem("cmcg-chart-metric", activeChartMetric);
    activeGoalId = ""; // switching to a raw metric clears the active-goal override
    localStorage.setItem("cmcg-active-goal", "");
    renderOverviewChart(); renderKpis();
  }
  const add = event.target.closest("[data-add-outcome]");
  if (add) openOutcome({ level: add.dataset.level || "ad", targetId: add.dataset.target || "" });
  if (event.target.closest("[data-close-outcome]")) document.getElementById("outcomeDialog").close();
  if (event.target.closest("[data-close-agent]")) document.getElementById("agentDialog")?.close();
  const editAgent = event.target.closest("[data-edit-agent]");
  if (editAgent) openAgentEditor(editAgent.dataset.editAgent);
  const deleteBudget = event.target.closest("[data-delete-budget]");
  if (deleteBudget) {
    if (confirm("Supprimer ce budget manuel ?")) {
      try { await api(`/api/daily-logs/${deleteBudget.dataset.deleteBudget}`, { method: "DELETE" }); await load(); toast("Budget supprimé"); }
      catch (error) { toast(error.message, "error"); }
    }
    return;
  }
  const deleteAgent = event.target.closest("[data-delete-agent]");
  if (deleteAgent) {
    const agent = byId(state.agents, deleteAgent.dataset.deleteAgent);
    if (agent && confirm(`Delete ${agent.name}? This removes the agent and clears old links, but keeps your imported ad data and outcomes.`)) {
      try { await api(`/api/agents/${agent.id}`, { method: "DELETE" }); document.getElementById("agentDialog")?.close(); await load(); toast("Agent deleted and ad sets rematched"); }
      catch (error) { toast(error.message, "error"); }
    }
  }
  const grouping = event.target.closest(".group-switch [data-group]");
  if (grouping) {
    groupBy = grouping.dataset.group;
    document.querySelectorAll("[data-group]").forEach((item) => item.classList.toggle("active", item.dataset.group === groupBy));
    renderPerformance();
  }
  const remove = event.target.closest("[data-delete-outcome]");
  if (remove && confirm("Delete this outcome? This cannot be undone.")) {
    try { await api(`/api/outcomes/${remove.dataset.deleteOutcome}`, { method: "DELETE" }); await load(); toast("Outcome deleted"); }
    catch (error) { toast(error.message, "error"); }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "languageSelect") {
    currentLanguage = event.target.value === "ar" ? "ar" : "base";
    localStorage.setItem("cmcg-language", currentLanguage);
    applyLanguage();
    renderAdsManager(); // dates are formatted in the chosen language
    return;
  }
  const transferGroup = event.target.closest("[data-transfer-group]");
  if (transferGroup) { quickUpdateStudent(transferGroup.dataset.transferGroup, { groupId: transferGroup.value }, "Étudiant transféré"); return; }
  const changeStatus = event.target.closest("[data-change-status]");
  if (changeStatus) { quickUpdateStudent(changeStatus.dataset.changeStatus, { status: changeStatus.value }, "Statut mis à jour"); return; }
  if (event.target.id === "periodPreset") { applyPeriodPreset(event.target.value); return; }
  if (event.target.id === "periodFrom" || event.target.id === "periodTo") {
    selectedPeriod = "custom";
    filters.from = document.getElementById("periodFrom").value;
    filters.to = document.getElementById("periodTo").value;
    savePeriod();
    updatePeriodControls();
    render();
    return;
  }
  if (event.target.id === "studentGroup") {
    setStudentDefaultPrice({ resetDefaults: true });
    const trainingPick = document.getElementById("studentTrainingPick");
    renderStudentSpotsMap(trainingPick?.value || "", event.target.value);
  }
  if (event.target.id === "studentTrainingPick") {
    renderStudentSpotsMap(event.target.value, document.getElementById("studentGroup")?.value || "");
  }
  if (event.target.name === "paymentPlan" && event.target.closest("#studentForm")) syncStudentPaymentFields({ resetDefaults: true });
  if ((event.target.name === "registeredAt" || event.target.name === "paymentStartDate") && event.target.closest("#studentForm")) syncStudentPaymentFields({ resetDefaults: !editingStudentId });
  if (event.target.closest("#paymentForm") && event.target.name === "paidAt") syncPaymentFormNextDate();
  if (event.target.id === "plannerTraining") {
    const program = byId(state.programs, event.target.value);
    const duration = document.getElementById("plannerDuration");
    if (program?.durationLabel && duration && !duration.value) duration.value = program.durationLabel;
    renderPlannerSuggestions();
  }
  if (event.target.id === "plannerMode") renderPlannerSuggestions();
  if (event.target.id === "reportAgent") { reportAgentId = event.target.value; localStorage.setItem("cmcg-report-agent", reportAgentId); renderReport(); }
  if (event.target.id === "goalType") syncGoalFormFields();
  if (event.target.id === "manualBudgetLevel") hydrateManualBudgetTarget();
  if (event.target.id === "manualBudgetPreset") syncManualBudgetDates();
  if (event.target.id === "sessionsGroupPick") { sessionsGroupId = event.target.value; renderPlannerSuggestions(); }
  const opsFilter = event.target.closest("[data-ops-filter]");
  if (opsFilter) { operationsFilters[opsFilter.dataset.opsFilter] = opsFilter.value; renderOperations(); }
  const studentsFilter = event.target.closest("[data-students-filter]");
  if (studentsFilter) { studentsFilters[studentsFilter.dataset.studentsFilter] = studentsFilter.value; renderStudentsPage(); }
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    filters[filter.dataset.filter] = filter.value;
    if (filter.dataset.filter === "from" || filter.dataset.filter === "to") {
      selectedPeriod = "custom";
      savePeriod();
      updatePeriodControls();
    }
    renderPerformance(); renderKpis(); renderFunnel(); renderOverviewTables(); renderOutcomes();
  }
  if (event.target.id === "performanceSort") { sortBy = event.target.value; renderPerformance(); }
  const column = event.target.closest("[data-column]");
  if (column) {
    if (column.checked) visibleColumns.add(column.dataset.column); else visibleColumns.delete(column.dataset.column);
    localStorage.setItem("cmcg-visible-columns", JSON.stringify([...visibleColumns]));
    renderPerformance();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#plannerTrainingName, #plannerDuration, #plannerCapacity")) renderPlannerSuggestions();
  if (event.target.closest("#studentForm") && ["totalDue", "installmentsCount"].includes(event.target.name)) {
    const form = event.target.form;
    if (normalizePaymentPlanUi(form.elements.paymentPlan?.value) === "monthly" && Number(form.elements.totalDue?.value || 0) && Number(form.elements.installmentsCount?.value || 0)) {
      form.elements.installmentAmount.value = (Number(form.elements.totalDue.value) / Number(form.elements.installmentsCount.value)).toFixed(2);
    }
  }
  if (event.target.closest("#paymentForm") && event.target.name === "amount") syncPaymentFormNextDate();
  const opsFilter = event.target.closest('[data-ops-filter="search"]');
  if (opsFilter) { operationsFilters.search = opsFilter.value; renderOperations(); }
  const studentsSearch = event.target.closest('[data-students-filter="search"]');
  if (studentsSearch) { studentsFilters.search = studentsSearch.value; renderStudentsList(); }
  const filter = event.target.closest('[data-filter="search"]');
  if (filter) { filters.search = filter.value; renderPerformance(); }
});

// Safe binder: never throws if an element is absent, so one missing node can't break the page.
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
  return el;
}
on("clearFilters", "click", () => {
  Object.keys(filters).forEach((key) => { filters[key] = ""; });
  applyPeriodPreset("last7", false);
  hydrateFilters(); render();
});
on("assignmentLevel", "change", () => fillOutcomeTargets());
on("outcomeTarget", "change", (event) => { ensureOutcomeTargetId().value = event.target.value; });
on("outcomeSearch", "input", renderOutcomes);
on("adsManager", "click", handleAdsManagerClick);
on("adsManager", "change", handleAdsManagerChange);
on("adsManager", "submit", handleAdsManagerSubmit);
// Collapsible sidebar so the workspace can use the full screen width.
const appShell = document.querySelector(".app-shell");
document.querySelectorAll(".sidebar .tab").forEach((tab) => { tab.title = tab.textContent.trim(); });
try { appShell?.classList.toggle("nav-collapsed", localStorage.getItem("cmcg-nav-collapsed") === "1"); } catch {}
on("navCollapse", "click", (event) => {
  const collapsed = appShell.classList.toggle("nav-collapsed");
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  try { localStorage.setItem("cmcg-nav-collapsed", collapsed ? "1" : "0"); } catch {}
});
on("adsManager", "input", (event) => {
  if (!event.target.matches("[data-am-search]")) return;
  amSearch = event.target.value;
  renderAdsManager();
});
// pointerdown (not click) so re-rendered picker contents never count as an outside click.
document.addEventListener("pointerdown", (event) => {
  if (amPicker && !event.target.closest(".fbam-date")) { amPicker = null; amRenderPickerOnly(); }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !amPicker) return;
  amPicker = null;
  amRenderPickerOnly();
  amRoot()?.querySelector("[data-am-date]")?.focus();
});
on("outcomeTypeFilter", "change", renderOutcomes);
on("refreshBtn", "click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await load(); toast("Data refreshed"); } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
});

on("metaCsvFile", "change", (event) => selectMetaFile(event.target.files[0]));
const importCard = document.getElementById("importCard");
if (importCard) {
  ["dragenter", "dragover"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.remove("dragging"); }));
  importCard.addEventListener("drop", (event) => selectMetaFile(event.dataTransfer.files[0]));
}
on("importCsvButton", "click", async (event) => {
  if (!pendingMetaFile) return;
  const button = event.currentTarget; const original = button.textContent; button.disabled = true; button.textContent = "Synchronizing…";
  try {
    const result = await api("/api/meta-import", { method: "POST", body: JSON.stringify({ filename: pendingMetaFile.name, csv: await pendingMetaFile.text() }) });
    pendingMetaFile = null; document.getElementById("metaCsvFile").value = ""; document.getElementById("selectedFile").classList.add("hidden");
    await load();
    const summary = result.result;
    toast(`${summary.rows} rows synced · ${summary.adsAdded} new ads · ${summary.metricsUpdated} updated`);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = !pendingMetaFile; button.textContent = original; }
});

on("restoreFile", "change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error("Backup file is larger than 10 MB");
    pendingRestore = JSON.parse(await file.text());
    const candidate = pendingRestore.state || pendingRestore;
    const total = ["agents", "campaigns", "adSets", "creatives", "outcomes", "dailyLogs"].reduce((sum, key) => sum + (Array.isArray(candidate[key]) ? candidate[key].length : 0), 0);
    if (!total) throw new Error("This file does not contain CRM records");
    document.getElementById("restoreSummary").textContent = `This backup contains ${total} CRM records. Current data will be replaced after a safety backup is created.`;
    document.getElementById("restoreDialog").showModal();
  } catch (error) { pendingRestore = null; event.target.value = ""; toast(error.message, "error"); }
});
on("confirmRestore", "click", async (event) => {
  event.preventDefault();
  if (!pendingRestore) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = "Restoring…";
  try { await api("/api/restore", { method: "POST", body: JSON.stringify(pendingRestore) }); pendingRestore = null; document.getElementById("restoreFile").value = ""; document.getElementById("restoreDialog").close(); await load(); toast("Backup restored successfully"); }
  catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Restore backup"; }
});

on("confirmResetData", "click", async (event) => {
  event.preventDefault();
  const button = event.currentTarget;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Resetting...";
  try {
    await api("/api/reset-data", { method: "POST", body: JSON.stringify({ confirm: true }) });
    document.getElementById("resetDataDialog").close();
    await load();
    toast("CRM data reset. Import your first real report.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

load().catch((error) => toast(error.message, "error"));
