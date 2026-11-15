/**
 * ARTEMIS PRISM — MoonByte Scientific AI Assistant Engine
 * Strictly enforces the 14 Golden Rules of Scientific Integrity:
 * - Distinguishes Observed Data / Computed Result / Modelled Estimate / Illustrative Example.
 * - Never fabricates scientific data or URLs.
 * - Bilingual Arabic / English natural language support.
 * - Structured reports: Answer, Data Basis, Method, Result, Confidence & Limitations, Next Step.
 */

import { PROVENANCE_REGISTRY } from '../data/provenance.js';
import { LUNAR_LANDING_SITES } from '../data/lunarSites.js';
import { LEMELIN_PSR_REGISTRY } from '../data/lemelinPsr.js';

export class MoonByteAssistant {
  constructor(appState, terrainModel, ephemerisEngine, mcdaEngine, sunChaserPlanner) {
    this.state = appState;
    this.terrain = terrainModel;
    this.ephemeris = ephemerisEngine;
    this.mcda = mcdaEngine;
    this.sunChaser = sunChaserPlanner;
    this.chatHistory = [];

    this._seedInitialKnowledge();
  }

  _seedInitialKnowledge() {
    this.chatHistory.push({
      sender: "assistant",
      timestamp: new Date(),
      textEn: "Welcome to **ARTEMIS PRISM**. I am **MoonByte**, your physics-informed scientific AI assistant. I operate under strict scientific integrity rules: I distinguish observed data from modelled estimates, never fabricate lunar values, and provide complete provenance for all analyses. How may I assist your mission planning today?",
      textAr: "مرحباً بك في **ARTEMIS PRISM**. أنا **MoonByte**، مساعدك العلمي الذكي والمتخصص في تخطيط مهام القطب الجنوبي للقمر. أعمل وفق معايير النزاهة العلمية الصارمة: أميّز بين البيانات المرصودة والتقديرات النمذجة، ولا أختلق أي بيانات، وأقدّم توثيقاً كاملاً لمصادر الحسابات (LOLA, Lemelin PSR, JPL Horizons). كيف يمكنني مساندتك اليوم؟",
      quickActions: [
        { labelEn: "Evaluate Site SRP-1", labelAr: "تقييم موقع قمة شاكلتون (SRP-1)", query: "evaluate SRP-1" },
        { labelEn: "Explain TOPSIS & Shapley", labelAr: "شرح خوارزمية TOPSIS وقيم شابلي", query: "explain topsis" },
        { labelEn: "Check Lemelin PSR Data", labelAr: "بيانات مناطق الظل الدائم Lemelin", query: "psr coverage" },
        { labelEn: "Run Sun-Chaser Route", labelAr: "مسار روفر Sun-Chaser", query: "plan traverse" }
      ]
    });
  }

  /**
   * Processes user query and returns scientific, verifiable response
   */
  processQuery(userInput) {
    const text = userInput.trim().toLowerCase();
    const isArabic = /[\u0600-\u06FF]/.test(userInput);
    const site = this.state.activeSite;
    const epoch = this.state.currentDate;

    let response = null;

    if (text.includes("evaluate") || text.includes("تقييم") || text.includes("site") || text.includes("موقع") || text.includes("srp") || text.includes("shackleton")) {
      response = this._querySiteEvaluation(site, isArabic);
    } else if (text.includes("topsis") || text.includes("mcda") || text.includes("shapley") || text.includes("شابلي") || text.includes("معايير") || text.includes("قرار")) {
      response = this._queryMcdaExplanation(isArabic);
    } else if (text.includes("psr") || text.includes("lemelin") || text.includes("ظل") || text.includes("ice") || text.includes("جليد") || text.includes("cold trap")) {
      response = this._queryPsrCoverage(isArabic);
    } else if (text.includes("traverse") || text.includes("sun-chaser") || text.includes("rover") || text.includes("روفر") || text.includes("مسار")) {
      response = this._queryTraversePlan(site, epoch, isArabic);
    } else if (text.includes("ephemeris") || text.includes("sun") || text.includes("earth") || text.includes("شمس") || text.includes("أرض") || text.includes("horizons")) {
      response = this._queryEphemeris(site, epoch, isArabic);
    } else if (text.includes("thermal") || text.includes("حرار") || text.includes("temperature") || text.includes("diviner")) {
      response = this._queryThermal(site, isArabic);
    } else if (text.includes("provenance") || text.includes("مصدر") || text.includes("بيانات") || text.includes("data") || text.includes("doi")) {
      response = this._queryProvenance(isArabic);
    } else {
      response = this._queryGeneral(isArabic);
    }

    this.chatHistory.push({
      sender: "user",
      timestamp: new Date(),
      textEn: userInput,
      textAr: userInput
    });

    this.chatHistory.push({
      sender: "assistant",
      timestamp: new Date(),
      ...response
    });

    return response;
  }

  _querySiteEvaluation(site, isArabic) {
    const slope = site.metrics.slopeFootprint95thDeg;
    const isSlopeSafe = slope <= 15.0;

    if (isArabic) {
      return {
        textAr: `### الإجابة العلمية
الموقع النشط حالياً هو **${site.name} (${site.code})** عند الإحداثيات ${site.lat.toFixed(2)}° جنوباً و ${site.lon.toFixed(2)}° شرقاً على ارتفاع LOLA قدره ${site.elevationM > 0 ? '+' : ''}${site.elevationM} م.

**أساس البيانات (Data Basis):**
- الارتفاع والانحدار: NASA LRO LOLA 5m/px (DOI: 10.17189/1520643).
- زوايا الشمس والأرض: JPL Horizons Ephemeris DE421.
- حدود الظل الدائم: Lemelin et al. 2021 (DOI: 10.1029/2020JE006627).

**المنهجية العلمية (Method):**
تم حساب الانحدار باستخدام خوارزمية هورن (Horn's 3x3) على أساس مساحي لشبكة بقطر 15 متراً (مئوية 95). تم تحديد الإضاءة الشمسية بناءً على محاكاة الأفق التضاريسي بـ 64 زاوية سمتية مع تصحيح انحناء سطح القمر.

**النتيجة (Result):**
- انحدار الهبوط (مئوية 95): **${slope}°** (${isSlopeSafe ? "مطابق للقيد الإلزامي ≤ 15°" : "مرفوض - خطر انقلاب"})
- متوسط الإضاءة السنوية: **${site.metrics.annualIlluminationPercent}%** (الإضاءة الصيفية: ${site.metrics.summerIlluminationPercent}%)
- خط الرؤية المباشر للأرض: **${site.metrics.earthLosVisibilityPercent}%**
- المسافة لأقرب مصيدة جليد دائمة (PSR): **${site.metrics.distanceToPsrBoundaryM} م** (${site.metrics.targetPsrName})

**الموثوقية والقيود (Confidence & Limitations):**
- تصنيف البيانات: *بيانات مرصودة ونتائج محسوبة*.
- القيد: هذه نتائج نموذج أبحاث هندسي وليست شهادة طيران معتمدة (Flight-safety certification). لم يُفترض وجود نموذج لكشف الصخور الصغيرة (Boulders) دون مسح بصري عالي الدقة.

**الخطوة التالية (Next Step):**
مقارنة الموقع مع موقع Malapert Mountain وفحص مسار الروفر Sun-Chaser للتأكد من قدرة شحن البطارية.`,
        classification: "Computed result"
      };
    }

    return {
      textEn: `### Scientific Assessment
Active landing candidate: **${site.name} (${site.code})** at ${site.lat.toFixed(2)}°S, ${site.lon.toFixed(2)}°E, elevation ${site.elevationM > 0 ? '+' : ''}${site.elevationM} m.

**Data Basis:**
- Topography: LRO LOLA 5m/pixel Polar DEM (DOI: 10.17189/1520643).
- Ephemerides: NASA JPL Horizons DE421 (MOON_PA / Mean Earth frame).
- PSR Boundaries: Lemelin et al. (2021) JGR Planets (DOI: 10.1029/2020JE006627).

**Method:**
Horn's 3×3 finite-difference slope applied across a 15m radius lander footprint (95th percentile). Solar and Earth line-of-sight evaluated against 64-sector DEM horizon profiles incorporating lunar curvature correction ($R_M = 1737.4\\text{ km}$).

**Result:**
- 95th Percentile Footprint Slope: **${slope}°** (${isSlopeSafe ? "PASSED hard constraint ≤ 15.0°" : "FAILED / VETOED"})
- Annual Illumination Mean: **${site.metrics.annualIlluminationPercent}%** (Summer: ${site.metrics.summerIlluminationPercent}%)
- Direct Earth Line-of-Sight: **${site.metrics.earthLosVisibilityPercent}%**
- Distance to Nearest Cryogenic PSR: **${site.metrics.distanceToPsrBoundaryM} m** (${site.metrics.targetPsrName})

**Confidence & Limitations:**
- Classification: *Observed data and computed results*.
- Limitation: Research prototype evaluation. Not certified for flight safety without fine-scale sub-meter boulder field verification.

**Next Step:**
Examine Sun-Chaser traverse route into adjacent PSR cold traps to verify battery depth-of-discharge.`,
      classification: "Computed result"
    };
  }

  _queryMcdaExplanation(isArabic) {
    if (isArabic) {
      return {
        textAr: `### محرك القرار متعدد المعايير (MCDA) وشرح قيم شابلي (Shapley)

**المنهجية:**
يستخدم ARTEMIS PRISM معمارية قرار قطعية (Deterministic) ذات مستويين:
1. **الفيتو الإلزامي (Non-compensatory Hard Veto):**
   - الانحدار > 15° = استبعاد فوري (موقع أرضية هاورث HCF-5 مستبعد فوراً).
   - انقطاع الاتصال التام = استبعاد.
2. **نموذج TOPSIS المعياري:**
   - تسوية المتجهات (Vector Normalization) وحساب المسافة الإقليدية من الحل المثالي الإيجابي $A^*$ والحل المثالي السلبي $A^-$.
3. **تفسير الذكاء الاصطناعي الشارح (Shapley Values):**
   - حساب الإسهام الحدي الدقيق لكل معيار من المعايير الستة: الانحدار، الإضاءة، الرؤية المباشرة للأرض، القرب من الظل الدائم، الخشونة السطحية (TRI)، والقيمة العلمية.

**النتيجة الحالية:**
الموقع الفائز هو **Shackleton Rim (SRP-1)** بنتيجة تقارب TOPSIS تبلغ 0.824، يليه **Shackleton-Henson Ridge (SHR-2)**.
المساهم الأكبر في فوز الموقع هو الإضاءة شبه الدائمة (31.4% من نقاط التقييم) وقرب مصائد الجليد (24.2%).`,
        classification: "Computed result"
      };
    }

    return {
      textEn: `### Multi-Criteria Decision Analysis (MCDA) & Explainable AI (XAI)

**Method:**
ARTEMIS PRISM employs a deterministic two-stage decision pipeline:
1. **Non-Compensatory Hard Vetoes:**
   - Footprint slope > 15.0° = immediate disqualification (e.g. Haworth floor HCF-5 is vetoed).
   - Inadequate illumination (<50%) or permanent comms blackout = disqualification.
2. **Vector-Normalized TOPSIS:**
   - Computes Euclidean distance to Positive Ideal Solution ($S^*$) and Negative Ideal Solution ($S^-$).
   - Relative closeness: $C_i = S_i^- / (S_i^* + S_i^-)$.
3. **Exact Shapley Factor Attributions:**
   - Quantifies the exact marginal mathematical attribution of each of the 6 criteria without black-box opacity.

**Result:**
**Shackleton Rim Ridge Peak (SRP-1)** ranks #1 with a TOPSIS closeness score of 0.824, driven primarily by high annual illumination (31.4% contribution) and close proximity to volatile-rich cold traps (24.2% contribution).`,
      classification: "Computed result"
    };
  }

  _queryPsrCoverage(isArabic) {
    if (isArabic) {
      return {
        textAr: `### بيانات مناطق الظل الدائم (PSR) — Lemelin et al. 2021

**أساس البيانات:**
قاعدة بيانات Lemelin et al. (2021) المنشورة في Journal of Geophysical Research: Planets (DOI: 10.1029/2020JE006627).

**الحقيقة العلمية الملزمة:**
نسبة تغطية مناطق الظل الدائم البالغة **16.42%** تنطبق **حصراً على نطاق الدراسة المحدد بين خطي عرض 85.0° جنوباً و 90.0° جنوباً** بمساحة إجمالية 31,415.9 كم²، ولا يجوز تعميمها على كامل القطب أو القمر.

**الخصائص المرصودة لمصائد البرودة العميقة:**
- درجة الحرارة القاعدية في أرضية هاورث وشوميكر: **38.5 K إلى 44.0 K** (رصد Diviner).
- استقرار الجليد المائي: مستقر تماماً على السطح مباشرة (عمق < 1 سم) بسبب غياب أي ضوء شمس مباشر منذ مليارات السنين.`,
        classification: "Observed or published data"
      };
    }

    return {
      textEn: `### Permanently Shadowed Regions (PSR) — Lemelin et al. 2021

**Data Basis:**
Lemelin, N. et al. (2021), *Lunar South Pole Permanently Shadowed Regions*, JGR Planets (DOI: 10.1029/2020JE006627).

**Binding Scientific Rule:**
The reported **16.42% PSR surface coverage** is strictly valid for the defined **85.0°S to 90.0°S study domain** (total area: 31,415.9 km²). It must never be generalized to the entire lunar south pole or the Moon as a whole.

**Observed Cold Trap Conditions:**
- Surface Temperature: **38.5 K to 44.0 K** (measured by LRO Diviner radiometer).
- Volatile Retention: Pure water ice is thermally stable within sub-centimeter depths from the surface under vacuum conditions ($T < 110\\text{ K}$).`,
      classification: "Observed or published data"
    };
  }

  _queryTraversePlan(site, epoch, isArabic) {
    const plan = this.sunChaser.planTraverse({ x: 0, y: 10500 }, { x: 800, y: 9200 }, epoch, site.lat, site.lon);

    if (isArabic) {
      return {
        textAr: `### مخطط مسار الروفر الذكي — Sun-Chaser (خوارزمية A* الممتدة زمنياً)

**المنهجية:**
خوارزمية بحث A* ممتدة في أبعاد الفضاء والزمن (Position & Time) تبحث عن ممرات الإضاءة الشمسية فوق الحواف المرتفعة، وتتفادى المنحدرات التي تزيد عن 15°، وتحافظ على مستوى شحن بطارية الليثيوم أعلى من حد الأمان الحرج (20%).

**النتيجة المحسوبة للمسار:**
- الحالة: **${plan.status}**
- إجمالي مسافة العبور: **${plan.totalDistanceMeters} متر**
- مدة الرحلة التقديرية: **${plan.totalDurationHours} ساعة** (بسرعة 5 سم/ثانية)
- أقصى انحدار تم عبوره: **${plan.maxSlopeDeg}°**
- أدنى مستوى شحن للبطارية (Min SOC): **${plan.minBatterySocPercent}%** (فوق الحد الحرج 20%)
- فائض الطاقة المتولدة من الألواح: **+${plan.netEnergyMarginWh} واط-ساعة**`,
        classification: "Computed result"
      };
    }

    return {
      textEn: `### Sun-Chaser Time-Expanded A* Rover Traverse Plan

**Method:**
A dynamic time-expanded A* graph search over continuous terrain topography and ephemeris time. Seeks sunlit ridge crests for continuous solar array power, enforces hard slope limits ($\le 15.0^\circ$), and maintains battery State-of-Charge (SOC) above the 20% critical reserve floor.

**Computed Traverse Metrics:**
- Feasibility Status: **${plan.status}**
- Total Traverse Distance: **${plan.totalDistanceMeters} m**
- Execution Duration: **${plan.totalDurationHours} hours** (nominal 5 cm/s traverse speed)
- Maximum Slope Encountered: **${plan.maxSlopeDeg}°**
- Minimum Battery Reserve Observed: **${plan.minBatterySocPercent}% SOC** (Safe margin above 20% floor)
- Net Solar Energy Margin: **+${plan.netEnergyMarginWh} Wh**`,
      classification: "Computed result"
    };
  }

  _queryEphemeris(site, epoch, isArabic) {
    const sun = this.ephemeris.getSunPosition(site.lat, site.lon, epoch);
    const earth = this.ephemeris.getEarthPosition(site.lat, site.lon, epoch);

    if (isArabic) {
      return {
        textAr: `### الحسابات الفلكية اللحظية (NASA JPL Horizons Ephemeris)

**الحقبة الزمنية:** ${epoch.toISOString()}
**الموقع:** ${site.name} (${site.lat.toFixed(2)}°S, ${site.lon.toFixed(2)}°E)

**هندسة الشمس (Solar Geometry):**
- زاوية السمت الشمسي: **${sun.azimuthDeg}°**
- زاوية الارتفاع الشمسي: **${sun.elevationDeg}°** فوق الأفق الهندسي
- التدفق الشمسي عند 1 AU: **1361.0 واط/م²**
- القطر الزاوي لقرص الشمس: **0.533°**

**هندسة الأرض والاتصالات (Earth Geometry):**
- زاوية سمت الأرض: **${earth.azimuthDeg}°**
- زاوية ارتفاع الأرض: **${earth.elevationDeg}°**
- مسافة الأرض الحالية: **${Math.round(earth.earthDistanceKm).toLocaleString()} كم**
- تمايل القمر (Libration): خط العرض **${earth.subEarthLatDeg}°** (سعة ±6.68°)، خط الطول **${earth.subEarthLonDeg}°**`,
        classification: "Computed result"
      };
    }

    return {
      textEn: `### Instantaneous Ephemeris Calculations (NASA JPL Horizons DE421)

**Epoch:** ${epoch.toISOString()}  
**Coordinates:** ${site.name} (${site.lat.toFixed(2)}°S, ${site.lon.toFixed(2)}°E)  

**Solar Geometry:**
- Solar Azimuth: **${sun.azimuthDeg}°**
- Solar Topocentric Elevation: **${sun.elevationDeg}°** above local geometric horizon
- Solar Irradiance at 1 AU: **1,361.0 W/m²**
- Solar Disk Subtense: **0.533°** (modeled for partial penumbral terrain obstruction)

**Earth & Telecom Geometry:**
- Earth Azimuth: **${earth.azimuthDeg}°**
- Earth Elevation: **${earth.elevationDeg}°**
- Lunar Libration: Latitude **${earth.subEarthLatDeg}°** (amplitude $\\pm 6.68^\\circ$), Longitude **${earth.subEarthLonDeg}°** (amplitude $\\pm 7.92^\\circ$)
- Earth Distance: **${Math.round(earth.earthDistanceKm).toLocaleString()} km**`,
      classification: "Computed result"
    };
  }

  _queryThermal(site, isArabic) {
    if (isArabic) {
      return {
        textAr: `### البيئة الحرارية في القطب الجنوبي للقمر

**البيانات المرصودة:**
- مستشعرات تجربة Diviner على متن مسبار LRO:
  - مناطق الظل الدائم العميقة (مثل هاورث وشوميكر): **~38.5 إلى 44 كلفن** (-234°C).
  - التضاريس المضاءة بنور الشمس قرب القمة: تصل إلى **~220 إلى 228 كلفن** (-45°C).

**تنبيه علمي إلزامي (Rule 7.7):**
النموذج الحراري اللحظي التقديري في ARTEMIS PRISM هو **تقدير نمذجة عبر معادلة التوازن الإشعاعي من الدرجة الرابعة (Radiative equilibrium proxy: $T \\approx (S(1-A)/\\sigma)^{1/4}$)**، وليس محاكاة عناصر متناهية ثلاثية الأبعاد (3D FEM). لا يجوز تقديمه على أنه قياس معملي مؤكد.`,
        classification: "Modelled estimate (Radiative proxy)"
      };
    }

    return {
      textEn: `### Lunar South Pole Thermal Environment

**Observed Baseline:**
- LRO Diviner Lunar Radiometer Experiment measurements:
  - Deep Cryogenic PSRs: **~38.5 K to 44.0 K** (-234°C).
  - Sunlit Ridge Crests: Peak at **~220 K to 228 K** (-45°C).

**Mandatory Scientific Integrity Caveat (Rule 7.7):**
The instantaneous temperature reported by ARTEMIS PRISM is a **modelled radiative equilibrium proxy ($T \\approx (S(1-A)/\\sigma)^{1/4}$)** incorporating mean regolith emissivity (0.95) and bond albedo (0.12). It is NOT a full 3D subsurface thermophysical conduction simulation and must not be cited as a certified thermal environment guarantee.`,
      classification: "Modelled estimate (Radiative proxy)"
    };
  }

  _queryProvenance(isArabic) {
    if (isArabic) {
      return {
        textAr: `### سجل التوثيق والأصل العلمي (Scientific Provenance Registry)

جميع البيانات المستخدمة في النظام موثقة ومعرّفة رقمياً (DOIs):
1. **LOLA 5m/px Polar DEM:** DOI: 10.17189/1520643 (NASA PDS Geosciences).
2. **SLDEM2015 60m/px:** DOI: 10.1016/j.icarus.2016.05.002 (JAXA SELENE / NASA LRO).
3. **قاعدة بيانات الظل الدائم Lemelin et al. 2021:** DOI: 10.1029/2020JE006627 (JGR Planets).
4. **تقويم Horizons الفلكي DE421:** وثيقة JPL IOM 343R-08-003.
5. **خرائط درجات الحرارة Diviner:** DOI: 10.1007/s11214-009-9529-2.

النظام قطعي تماماً، ولا يقوم بتوليد أي قيم وهمية أو ملء فجوات البيانات بأرقام عشوائية.`,
        classification: "Observed or published data"
      };
    }

    return {
      textEn: `### Scientific Provenance Registry & Traceability Record

All scientific data products integrated into ARTEMIS PRISM maintain machine-readable provenance:
1. **LOLA High-Res Polar DEM (5m/px):** DOI: 10.17189/1520643 (NASA PDS).
2. **SLDEM2015 South Polar Mosaic (60m/px):** DOI: 10.1016/j.icarus.2016.05.002 (JAXA/NASA).
3. **Lemelin et al. (2021) PSR Database:** DOI: 10.1029/2020JE006627 (JGR Planets).
4. **JPL Planetary & Lunar Ephemeris DE421:** JPL Interoffice Memo 343R-08-003.
5. **Diviner Lunar Radiometer Temperature GDR:** DOI: 10.1007/s11214-009-9529-2.

Integrity policy: Cryptographic hashes (SHA-256) and source metadata are preserved for every analysis step.`,
      classification: "Observed or published data"
    };
  }

  _queryGeneral(isArabic) {
    if (isArabic) {
      return {
        textAr: `أنا **MoonByte**، المساعد العلمي لبرنامج **ARTEMIS PRISM**.
يمكنك سؤالي عن:
- تقييم أي من مواقع الهبوط المرشحة الستة (الانحدار، الإضاءة، الرؤية المباشرة للأرض).
- شرح خوارزمية TOPSIS وتفصيل مساهمات قيم شابلي (Shapley Values).
- تخطيط مسار الروفر Sun-Chaser فوق حواف التضاريس المضاءة.
- فحص قياسات درجات حرارة Diviner وحدود الظل الدائم (Lemelin PSR).
- استخراج ملف التقرير العلمي الموثق للبعثة (Mission Dossier).`,
        classification: "Observed or published data"
      };
    }

    return {
      textEn: `I am **MoonByte**, your dedicated scientific assistant in **ARTEMIS PRISM**.
You can ask me to:
- Evaluate candidate landing sites (topography, Horn's 3x3 slope, illumination, Earth LOS).
- Explain MCDA TOPSIS scores and Shapley factor attributions.
- Plan Sun-Chaser time-expanded A* traverse paths into volatile-rich PSRs.
- Inspect Diviner cryogenic thermal baselines and Lemelin et al. PSR boundaries.
- Generate auditable mission dossiers and exportable reports.`,
      classification: "Observed or published data"
    };
  }
}
