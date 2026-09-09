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
  "Objectif & progression": "الهدف والتقدم",
  "Suivi de l'objectif": "متابعة الهدف",
  "Valeurs exactes. Choisissez une métrique dans les cartes, ou fixez un objectif pour voir le rythme.": "قيم دقيقة. اختر مقياساً من البطاقات، أو حدد هدفاً لرؤية الإيقاع.",
  "+ Objectif": "+ هدف",
  "Nouvel objectif": "هدف جديد",
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
});

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

function overlapsRange(start, end) {
  return (!filters.from || (end || start) >= filters.from) && (!filters.to || start <= filters.to);
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

function filteredLogs() {
  return state.dailyLogs.filter((log) => {
    const start = log.reportingStart || log.date || "";
    const end = log.reportingEnd || log.date || start;
    return overlapsRange(start, end) && relationMatches(relationForLog(log));
  });
}

function filteredOutcomes() {
  return state.outcomes.filter((outcome) => overlapsRange(outcome.sourceDate || outcome.date, outcome.date)
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
function agentRevenue(agentId, useFilters = true) {
  if (!agentId) return { collected: 0, potential: 0 };
  const students = state.students.filter((s) => s.agentId === agentId && s.status !== "cancelled");
  const studentIds = new Set(students.map((s) => s.id));
  const potential = students.reduce((sum, s) => sum + Number(s.totalDue || 0), 0);
  const collected = state.payments
    .filter((p) => studentIds.has(p.studentId) && (!useFilters || overlapsRange(p.paidAt, p.paidAt)))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { collected, potential };
}

function performanceRows(type = groupBy, useFilters = true, criterion = sortBy) {
  const rows = new Map();
  function ensure(key) {
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { ...groupDescriptor(key, type), ...emptyMetrics(), latestLog: null });
    return rows.get(key);
  }
  const logs = useFilters ? filteredLogs() : state.dailyLogs;
  const outcomes = useFilters ? filteredOutcomes() : state.outcomes;
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
      const revenue = agentRevenue(row.targetId, useFilters);
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
      <span class="goal-delete" data-delete-goal="${escapeHtml(goal.id)}" role="button" aria-label="Supprimer">✕</span>
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
function openGoalForm() {
  ensureGoalDialog();
  const form = document.getElementById("goalForm");
  form.reset();
  const today = todayInput();
  const end = new Date(); end.setDate(end.getDate() + 30);
  form.elements.from.value = today;
  form.elements.to.value = end.toISOString().slice(0, 10);
  syncGoalFormFields();
  applyLanguage(document.getElementById("goalDialog"));
  document.getElementById("goalDialog").showModal();
}
function ensureGoalDialog() { /* dialog is static in index.html */ }

// Exact-value single-metric trend. If a goal is active it drives the metric, adds a target
// line, an ideal pace line, and cumulative values; otherwise it charts the one selected card.
let activeChartMetric = localStorage.getItem("cmcg-chart-metric") || "registered";
function renderOverviewChart() {
  const container = document.getElementById("overviewChart");
  if (!container) return;
  const goal = activeGoal();
  // Choose the metric + whether to accumulate.
  const metricKey = goal ? goalMetricKey(goal) : activeChartMetric;
  const cumulative = goal ? goalIsCumulative(goal) : (metricKey !== "costRegisteredEfficiency");
  const definition = overviewMetricDefinitions[metricKey] || overviewMetricDefinitions.registered;

  // Date range: the goal window, else the reporting period's daily rows.
  let rows;
  if (goal) {
    rows = goalDailyRows(goal.from, goal.to);
    if (!rows.length) rows = [{ date: goal.from, ...emptyMetrics(), visited: 0 }, { date: goal.to, ...emptyMetrics(), visited: 0 }];
  } else {
    rows = overviewDailyRows();
  }
  if (!rows.length) {
    container.innerHTML = '<div class="empty chart-empty">Importez des rapports ou définissez un objectif pour voir la courbe.</div>';
    return;
  }

  // Build exact values (cumulative running total, or per-day / period cost).
  let running = 0;
  const values = rows.map((row) => {
    if (metricKey === "revenue") { const v = revenueOnDate(row.date); running += v; return cumulative ? running : v; }
    const raw = metricRawValue(metricKey, row);
    const num = raw === null || !Number.isFinite(raw) ? 0 : raw;
    if (cumulative) { running += num; return running; }
    return raw; // may be null for cost/registered on days with 0 registrations
  });

  const target = goal ? Number(goal.target) : 0;
  const finite = values.filter((v) => v !== null && Number.isFinite(v));
  const dataMax = Math.max(...finite, target, 0);
  const dataMin = Math.min(...finite, goalLowerIsBetter(goal || {}) && target ? target : 0);
  const yMax = goal && goalLowerIsBetter(goal) ? Math.max(dataMax, target * 1.2) : Math.max(dataMax * 1.1, target || 1);
  const yMin = Math.min(0, dataMin);

  const width = 1000;
  const height = 460;
  const pad = { left: 64, right: 28, top: 28, bottom: 52 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (rows.length === 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const yFor = (value) => pad.top + innerHeight - ((value - yMin) / ((yMax - yMin) || 1)) * innerHeight;

  // Nice exact ticks (real numbers, not 0-100).
  const isMoney = metricKey === "revenue" || metricKey === "costRegisteredEfficiency";
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / tickCount);
  const grid = ticks.map((value) => {
    const y = yFor(value);
    const label = isMoney ? money(value) : number(Math.round(value));
    return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" /><text x="${pad.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(label)}</text>`;
  }).join("");

  const step = Math.max(1, Math.ceil(rows.length / 8));
  const xLabels = rows.map((row, index) => ({ row, index })).filter(({ index }) => index === 0 || index === rows.length - 1 || index % step === 0)
    .map(({ row, index }, i, labels) => `<text x="${xFor(index).toFixed(1)}" y="${height - 16}" text-anchor="${i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}">${escapeHtml(row.date.slice(5))}</text>`).join("");

  // Main data line (skip null gaps for cost/registered).
  const points = values.map((v, i) => (v === null || !Number.isFinite(v)) ? null : { x: xFor(i), y: yFor(v), raw: v, row: rows[i] }).filter(Boolean);
  const pathPoints = points.length === 1 ? [{ ...points[0], x: pad.left }, { ...points[0], x: width - pad.right }] : points;
  const dataPath = points.length ? `<path class="trend-main" d="${chartPath(pathPoints)}" stroke="${definition.color}" /><path class="trend-fill" d="${chartPath(pathPoints)} L ${xFor(points.length - 1).toFixed(1)} ${yFor(yMin).toFixed(1)} L ${pathPoints[0].x.toFixed(1)} ${yFor(yMin).toFixed(1)} Z" fill="${definition.color}" />` : "";
  const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" stroke="${definition.color}"><title>${escapeHtml(p.row.date)} · ${escapeHtml(isMoney ? money(p.raw) : number(p.raw))}</title></circle>`).join("");

  // Goal overlays: target line + ideal pace line (start 0 -> target across the window).
  let goalLayer = "";
  let banner = "";
  if (goal) {
    const gp = goalProgress(goal);
    const targetY = yFor(target);
    goalLayer += `<line class="goal-target" x1="${pad.left}" y1="${targetY.toFixed(1)}" x2="${width - pad.right}" y2="${targetY.toFixed(1)}" /><text class="goal-target-label" x="${width - pad.right}" y="${(targetY - 8).toFixed(1)}" text-anchor="end">🎯 ${escapeHtml(isMoney ? money(target) : number(target))}</text>`;
    if (!goalLowerIsBetter(goal) && cumulative) {
      // Ideal diagonal pace line from (start,0) to (end,target).
      const x0 = xFor(0); const y0 = yFor(0); const x1 = xFor(rows.length - 1); const y1 = yFor(target);
      goalLayer += `<line class="goal-pace" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" />`;
    }
    const cls = gp.status.key === "behind" ? "behind" : (gp.status.key === "done" || gp.status.key === "ahead") ? "ahead" : "ontrack";
    const currentTxt = isMoney ? money(gp.current) : number(Math.round(gp.current));
    const targetTxt = isMoney ? money(target) : number(target);
    banner = `<div class="goal-banner ${cls}">
      <div class="goal-banner-main"><span class="goal-kicker">${escapeHtml(goal.title || goalTypeLabel(goal))}</span><strong>${escapeHtml(currentTxt)} <span>/ ${escapeHtml(targetTxt)}</span></strong><small>${escapeHtml(goal.from)} → ${escapeHtml(goal.to)} · jour ${gp.elapsedDays}/${gp.totalDays}</small></div>
      <div class="goal-banner-status"><span class="goal-status-pill ${cls}">${escapeHtml(gp.status.label)}</span><div class="goal-progress"><i style="width:${gp.percent}%"></i></div><small>${gp.percent}%${goalLowerIsBetter(goal) ? "" : ` · rythme attendu ${escapeHtml(isMoney ? money(gp.expected) : number(Math.round(gp.expected)))}`}</small></div>
    </div>`;
  }

  const headline = goal
    ? ""
    : `<div class="chart-metric-switch">${["registered", "visited", "booked", "messages", "spend", "costRegisteredEfficiency"].map((key) => `<button type="button" class="${key === metricKey ? "active" : ""}" data-chart-metric="${key}">${escapeHtml(overviewMetricDefinitions[key].label)}</button>`).join("")}</div>`;

  container.innerHTML = `${banner}${headline}<svg class="trend-svg exact" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trend graph">${grid}${goalLayer}<g class="trend-lines">${dataPath}${dots}</g><g class="trend-axis">${xLabels}</g></svg><p class="chart-note">${goal ? "Valeurs exactes. La ligne pointillée = rythme idéal pour atteindre l'objectif à la date prévue." : "Valeurs exactes. Choisissez une métrique ci-dessus, ou définissez un objectif pour suivre le rythme."}</p>`;
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

function renderOverviewTables() {
  const ads = performanceRows("ad", true, "quality").slice(0, 7);
  document.getElementById("overviewRows").innerHTML = ads.length ? ads.map((row) => `<tr class="${qualityRowClass(row)}"><td>${entityCell(row, "ad")}</td><td>${qualityBadge(row)}</td><td>${escapeHtml(row.relation.agent?.name || "Unassigned")}</td><td class="number-cell">${money(row.spend)}</td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.visits}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td><td>${addOutcomeButton("ad", row.targetId, row.name)}</td></tr>`).join("") : '<tr><td colspan="10" class="empty">Import a Meta Ads report to see performance.</td></tr>';
  const agents = performanceRows("agent", true, "quality").filter((row) => row.key !== "__unassigned");
  document.getElementById("agentRows").innerHTML = agents.length ? agents.map((row) => `<tr class="${qualityRowClass(row)}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${qualityBadge(row)}</td><td>${agentClosingBadge(row)}</td><td class="number-cell">${number(row.messages)}</td><td class="number-cell">${row.booked}</td><td class="number-cell">${row.visits}</td><td class="number-cell"><strong>${row.registered}</strong></td><td class="number-cell">${cost(row.spend, row.registered)}</td></tr>`).join("") : '<tr><td colspan="8" class="empty">Add agents to compare their results.</td></tr>';
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
    return `<article class="card agent-card"><div class="agent-avatar" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</div><div class="agent-main"><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.whatsapp || "No WhatsApp number")}</small></div><div class="agent-stat"><strong>${adSets.length}</strong><span>matched ad sets</span></div><div class="agent-stat"><strong>${metrics.registered || 0}</strong><span>registrations</span></div><div class="agent-stat closing-stat">${agentClosingBadge(metrics)}</div><div class="agent-actions"><button class="row-add" type="button" data-add-outcome data-level="agent" data-target="${escapeHtml(agent.id)}" aria-label="Add outcome for ${escapeHtml(agent.name)}">+</button><button class="icon-button small" type="button" data-edit-agent="${escapeHtml(agent.id)}" aria-label="Edit ${escapeHtml(agent.name)}" title="Edit agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16.6 10.9-10.9 2.4 2.4L7.4 19H5v-2.4ZM17.1 4.5l1.1-1.1c.6-.6 1.6-.6 2.2 0l.2.2c.6.6.6 1.6 0 2.2l-1.1 1.1-2.4-2.4Z"/></svg></button><button class="delete-button small" type="button" data-delete-agent="${escapeHtml(agent.id)}" aria-label="Delete ${escapeHtml(agent.name)}" title="Delete agent"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7ZM9 9v8h2V9H9Zm4 0v8h2V9h-2ZM8 3h8l1 1h4v2H3V4h4l1-1Z"/></svg></button></div></article>`;
  }).join("") : '<div class="empty card">Add your first sales agent. Existing imported ad sets will be matched immediately.</div>';
  const unassigned = state.adSets.filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  document.getElementById("unassignedAdSets").innerHTML = unassigned.length ? unassigned.map((adSet) => `<div class="simple-list-row"><div><strong>${escapeHtml(adSet.name)}</strong><small>${escapeHtml(byId(state.campaigns, adSet.campaignId)?.name || "Unknown campaign")}</small></div><span class="status-pill ${adSet.agentMatchStatus === "ambiguous" ? "warning" : ""}">${adSet.agentMatchStatus === "ambiguous" ? "Multiple names found" : "No matching agent"}</span></div>`).join("") : '<div class="empty success-empty">All imported ad sets are assigned.</div>';
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
  renderGoals(); renderKpis(); renderFunnel(); renderAttention(); renderOverviewTables(); renderPerformance(); renderOutcomes(); renderOperations(); renderStudentsPage(); renderAgents(); renderImports(); renderManualBudget(); renderStorage(); renderScoringSettings();
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
  applyLanguage(document.getElementById("outcomeDialog"));
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
  dialog.innerHTML = `<form id="agentEditForm" class="modal-content"><div class="modal-head"><div><p class="section-kicker">Sales agent</p><h2>Edit agent</h2><p>Renaming an agent rematches imported ad sets by name, ignoring uppercase/lowercase.</p></div><button class="icon-button" type="button" data-close-agent aria-label="Close agent form"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg></button></div><div class="form-grid"><label><span>Agent name</span><input name="name" required placeholder="Souad" autocomplete="off" /></label><label><span>WhatsApp <em>optional</em></span><input name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="+212 6..." /></label></div><p class="form-hint">If this exact name appears in campaign, ad set, or ad names, those rows will be assigned to the agent automatically.</p><div class="modal-actions"><button class="button secondary" type="button" data-close-agent>Cancel</button><button class="button primary" type="submit">Save agent</button></div></form>`;
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
      const goal = await api("/api/goals", { method: "POST", body: JSON.stringify(formPayload(form)) });
      document.getElementById("goalDialog").close();
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
  if (event.target.closest("[data-close-goal]")) document.getElementById("goalDialog")?.close();
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
      try { await api(`/api/agents/${agent.id}`, { method: "DELETE" }); await load(); toast("Agent deleted and ad sets rematched"); }
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

document.getElementById("clearFilters").addEventListener("click", () => {
  Object.keys(filters).forEach((key) => { filters[key] = ""; });
  applyPeriodPreset("last7", false);
  hydrateFilters(); render();
});
document.getElementById("assignmentLevel").addEventListener("change", () => fillOutcomeTargets());
document.getElementById("outcomeTarget").addEventListener("change", (event) => { ensureOutcomeTargetId().value = event.target.value; });
document.getElementById("outcomeSearch").addEventListener("input", renderOutcomes);
document.getElementById("outcomeTypeFilter").addEventListener("change", renderOutcomes);
document.getElementById("refreshBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { await load(); toast("Data refreshed"); } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
});

document.getElementById("metaCsvFile").addEventListener("change", (event) => selectMetaFile(event.target.files[0]));
const importCard = document.getElementById("importCard");
["dragenter", "dragover"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.add("dragging"); }));
["dragleave", "drop"].forEach((name) => importCard.addEventListener(name, (event) => { event.preventDefault(); importCard.classList.remove("dragging"); }));
importCard.addEventListener("drop", (event) => selectMetaFile(event.dataTransfer.files[0]));
document.getElementById("importCsvButton").addEventListener("click", async (event) => {
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

document.getElementById("restoreFile").addEventListener("change", async (event) => {
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
document.getElementById("confirmRestore").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!pendingRestore) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = "Restoring…";
  try { await api("/api/restore", { method: "POST", body: JSON.stringify(pendingRestore) }); pendingRestore = null; document.getElementById("restoreFile").value = ""; document.getElementById("restoreDialog").close(); await load(); toast("Backup restored successfully"); }
  catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Restore backup"; }
});

document.getElementById("confirmResetData").addEventListener("click", async (event) => {
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
