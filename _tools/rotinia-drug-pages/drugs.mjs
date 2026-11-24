// Per-drug content for the four English injection-site pages. Every label
// statement is from the US label on DailyMed (SPL text read 2026-11-24).
const DM = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=';
const ZE = DM + '487cd7e7-434c-4925-99fa-aa80b1cc776b';
const MO = DM + 'd2d7da5d-ad07-4228-955f-cf7e355c8cc0';
const WE = DM + 'ee06186f-2aa3-4990-a760-757579d8f77b';
const OZ = DM + 'adec4fd2-6858-4c99-91d4-531f5f2a2d79';

const notDose = (name) => `<p>Nothing here is about how much to take or when to change it: your prescriber decides that, and the dose is set on the label of the ${name} you were given.</p>`;

export const DRUGS = [
  {
    slug: 'zepbound-injection-sites',
    name: 'Zepbound', generic: 'tirzepatide', maker: 'Eli Lilly', owner: 'Eli Lilly and Company', device: 'pen or vial',
    title: 'Zepbound injection sites: where to inject and how to rotate',
    h1: 'Zepbound injection sites: where to inject and how to rotate',
    description: 'Where to inject Zepbound, from the US label: stomach (abdomen), thigh, or the back of the upper arm by someone else. Rotate every week. Pen, vial and KwikPen basics, plus a free rotation planner.',
    printSub: 'Zepbound: stomach (abdomen) or thigh; back of the upper arm only by another person. Change the site every week. Follow the Instructions for Use for your pen or vial.',
    answer: `
<p><strong>Short answer:</strong> inject Zepbound under the skin of your <strong>stomach (abdomen) or thigh</strong>. The <strong>back of the upper arm</strong> works too, but the label says <strong>another person</strong> should give that injection. Change (rotate) the spot <strong>every week</strong>: the same area is fine, but not the same spot as last time, and the KwikPen instructions add <strong>at least 2 inches from the belly button</strong>.</p>`,
    body: `
<h2 id="label">What the Zepbound label says about injection sites</h2>
<p>The Zepbound prescribing information (section 2) says: "Inject ZEPBOUND subcutaneously in the abdomen, thigh, or another person should inject in the back of the upper arm." and "Rotate injection sites with each dose." It is given "once weekly at any time of day, with or without meals."</p>
<p>Zepbound comes in four forms, and each has its own Instructions for Use. They describe the sites a little differently:</p>
<table class="sum">
<caption>Where each Zepbound form's instructions say to inject</caption>
<tr><th scope="col">Zepbound form</th><th scope="col">You can inject</th><th scope="col">Only another person</th></tr>
<tr><th scope="row">Single-dose pen</th><td>Stomach (abdomen) or thigh</td><td>Back of the upper arm</td></tr>
<tr><th scope="row">Single-dose vial and multi-dose vial</th><td>Stomach (abdomen) or thigh</td><td>Back of the upper arm</td></tr>
<tr><th scope="row">KwikPen (4 weekly doses)</th><td>Thigh or stomach, at least 2 inches from the belly button</td><td>Back of the upper arm</td></tr>
</table>
<ul>
<li><strong>Rotate within an area:</strong> "Change (rotate) your injection site each week. You may use the same area of your body but be sure to choose a different injection site in that area." (pen and KwikPen instructions)</li>
<li><strong>Why rotate:</strong> the vial instructions say to rotate "to reduce your risk of getting lipodystrophy (pits in skin or thickened skin) and localized cutaneous amyloidosis (skin with lumps) at the injection sites."</li>
<li><strong>Other injected medicines:</strong> "Do not inject ZEPBOUND in the same injection site used for other medicines." (vial instructions)</li>
<li><strong>Which site is best:</strong> "Your healthcare provider can help you choose the injection site that is best for you." (pen instructions)</li>
</ul>

<h2 id="how">How to inject Zepbound</h2>
<p>A short summary of the steps in the Zepbound Instructions for Use. Read the full instructions for the form you have; your doctor or pharmacist can show you how.</p>
<h3>Zepbound single-dose pen</h3>
<ol>
<li><strong>Choose your injection site</strong> (stomach or thigh, or the back of the upper arm if someone else injects).</li>
<li><strong>Pull off the gray base cap.</strong> Make sure the pen is locked; "Do not put the gray base cap back on – this could damage the needle. Do not touch the needle."</li>
<li><strong>Place the clear base on your skin, then unlock</strong> by turning the lock ring.</li>
<li><strong>Press and hold up to 10 seconds:</strong> "Press and hold the purple injection button for up to 10 seconds." Listen for the first click (injection started) and the second click (injection completed); the injection is complete when the gray plunger is visible.</li>
<li>Put the used pen in an FDA-cleared sharps disposal container right away.</li>
</ol>
<h3>Zepbound vials (single-dose and multi-dose)</h3>
<p>Vials are injected with a syringe and needle. The prescribing information says to "always use a new syringe and needle for each injection" and to use a syringe appropriate for the dose. The vial instructions go: pull off the plastic cap and wipe the rubber stopper, attach the needle to the syringe, draw the medicine up with the vial upside down, then choose your site, insert the needle, push the plunger down, and "The needle should stay in your skin for at least 5 seconds to make sure you have injected all of your dose." Don't recap the needle; put the needle and syringe in a sharps container right away.</p>
<h3>Zepbound KwikPen</h3>
<p>The KwikPen holds four weekly doses and uses a new pen needle each time: "Always use a new pen needle for each injection to help prevent infections and blocked needles." Its instructions say to prime before each weekly injection (release a little medicine into the air until a drop appears), then turn the dose knob until it stops, insert the needle, and push the dose knob in "until it stops then slowly count to 5 while holding the dose knob." Unscrew the used needle into a sharps container and replace the pen cap.</p>
${notDose('Zepbound')}
<p>Using Mounjaro instead? It is the same medicine (tirzepatide) with its own label and a note about insulin: <a href="../mounjaro-injection-sites/">Mounjaro injection sites</a>.</p>`,
    sources: `
<p class="small">From the US Zepbound label on DailyMed (US National Library of Medicine), label version of 2026-11-16, read on 2026-11-24:</p>
<ul class="small">
<li><a href="${ZE}">Zepbound (tirzepatide) injection, Eli Lilly and Company</a>: prescribing information section 2 (Dosage and Administration), Medication Guide, and the Instructions for Use for the single-dose pen, the single-dose vial, the multi-dose vial and the KwikPen</li>
</ul>`,
  },
  {
    slug: 'mounjaro-injection-sites',
    name: 'Mounjaro', generic: 'tirzepatide', maker: 'Eli Lilly', owner: 'Eli Lilly and Company', device: 'pen',
    title: 'Mounjaro injection sites: where to inject and how to rotate',
    h1: 'Mounjaro injection sites: where to inject and how to rotate',
    description: 'Where to inject Mounjaro, from the US label: stomach (abdomen), thigh, or the back of the upper arm by someone else. Rotate every week; with insulin, same area but not next to each other. Free rotation planner.',
    printSub: 'Mounjaro: stomach (abdomen) or thigh; back of the upper arm only by another person. Change the site every week. With insulin: separate shots, not next to each other.',
    answer: `
<p><strong>Short answer:</strong> inject Mounjaro under the skin of your <strong>stomach (abdomen) or thigh</strong>, or have <strong>another person</strong> inject it in the <strong>back of your upper arm</strong>. Change (rotate) the site <strong>with each weekly injection</strong>; the same area is fine if the spot is different, and the KwikPen instructions say <strong>at least 2 inches from the belly button</strong>. If you also take insulin, inject them <strong>separately, never mixed</strong>: the same body area is fine, but not right next to each other.</p>`,
    body: `
<h2 id="label">Where the Mounjaro label says to inject</h2>
<p>Section 2.2 of the Mounjaro prescribing information: "Inject MOUNJARO subcutaneously in the abdomen, thigh, or have another person inject MOUNJARO in the back of the upper arm." It also says "Rotate injection sites with each dose" and to give it "once weekly, any time of day, with or without meals." The Medication Guide puts it in plain words: "Inject MOUNJARO under the skin (subcutaneously) of your stomach (abdomen), thigh, or another person should inject in the back of the upper arm."</p>

<h2 id="insulin">Mounjaro and insulin: can you inject in the same area?</h2>
<p>Yes, as two separate injections. The prescribing information says: "When using MOUNJARO with insulin, administer as separate injections and never mix. It is acceptable to inject MOUNJARO and insulin in the same body region, but the injections should not be adjacent to each other." The Medication Guide: "You may give an injection of MOUNJARO and insulin in the same body area (such as your stomach area), but not right next to each other." The vial instructions add: "Do not inject MOUNJARO in the same injection site used for other medicines."</p>
<p>If you use both, ask your doctor or pharmacist how to plan the two sets of injection sites.</p>

<h2 id="rotate">How often to rotate Mounjaro sites</h2>
<p>Every week. The pen instructions: "Change (rotate) your injection site each week. You may use the same area of your body but be sure to choose a different injection site in that area." The vial instructions give the reason: to reduce the risk of "lipodystrophy (pits in skin or thickened skin) and localized cutaneous amyloidosis (skin with lumps) at the injection sites."</p>

<h2 id="how">How to inject Mounjaro</h2>
<p>Mounjaro comes as a single-dose pen, single-dose and multi-dose vials, and the KwikPen (4 weekly doses). Here is the gist of the two pen instructions; follow the full Instructions for Use for yours, and ask your pharmacist to walk you through it.</p>
<table class="sum">
<caption>Mounjaro single-dose pen vs KwikPen</caption>
<tr><th scope="col"></th><th scope="col">Single-dose pen</th><th scope="col">KwikPen</th></tr>
<tr><th scope="row">Needle</th><td>Built in; "Do not touch the needle."</td><td>Attach a new pen needle every week</td></tr>
<tr><th scope="row">Before injecting</th><td>Pull off the gray base cap, place the clear base flat on the skin, unlock</td><td>Prime: release a little medicine into the air until a drop appears</td></tr>
<tr><th scope="row">Injecting</th><td>Press and hold the purple button up to 10 seconds; first click = started, second click = completed</td><td>Push the dose knob in until it stops, then slowly count to 5 while holding it</td></tr>
<tr><th scope="row">Done when</th><td>The gray plunger is visible</td><td>The icon shows in the dose window</td></tr>
<tr><th scope="row">After</th><td>Whole pen into a sharps container</td><td>Needle into a sharps container; replace the pen cap</td></tr>
</table>
<ul>
<li>Pen: "Do not remove the Pen from your skin until you hear the second loud click." The instructions add: "Some people may hear a soft click right before the second loud click."</li>
<li>KwikPen: "A drop of medicine on the needle tip is normal. It will not affect your dose." If you see blood, "lightly press the injection site with gauze or a cotton ball."</li>
<li>Vials: a new syringe and needle each time; the needle stays in the skin for at least 5 seconds.</li>
</ul>
${notDose('Mounjaro')}
<p>Prescribed Zepbound instead? It is the same medicine with its own label and vial options: <a href="../zepbound-injection-sites/">Zepbound injection sites</a>. In Portuguese and Spanish, with the Brazilian and Latin American labels: <a href="../pt/onde-aplicar-mounjaro/" hreflang="pt-BR" lang="pt-BR">Onde aplicar Mounjaro</a> · <a href="../es/donde-aplicar-mounjaro/" hreflang="es" lang="es">Dónde aplicar Mounjaro</a>.</p>`,
    sources: `
<p class="small">From the US Mounjaro label on DailyMed (US National Library of Medicine), label version of 2026-11-16, read on 2026-11-24:</p>
<ul class="small">
<li><a href="${MO}">Mounjaro and Mounjaro KwikPen (tirzepatide) injection, Eli Lilly and Company</a>: prescribing information section 2.2 (Important Administration Instructions), Medication Guide, and the Instructions for Use for the single-dose pen, the single-dose and multi-dose vials and the KwikPen</li>
</ul>`,
  },
  {
    slug: 'wegovy-injection-sites',
    name: 'Wegovy', generic: 'semaglutide', maker: 'Novo Nordisk', owner: 'Novo Nordisk A/S', device: 'pen',
    title: 'Wegovy injection sites: where to inject and how to rotate',
    h1: 'Wegovy injection sites: where to inject and how to rotate',
    description: 'Where to inject Wegovy, from the US label: lower stomach 2 inches from the belly button, front of the thigh, or upper arm. Rotate every week. Wegovy pen basics and a free rotation planner.',
    printSub: 'Wegovy: lower stomach (2 inches from the belly button), front of the thigh, or upper arm. Not the same spot each week. Follow the Instructions for Use for your pen.',
    answer: `
<p><strong>Short answer:</strong> inject Wegovy under the skin of your <strong>stomach (abdomen), thigh or upper arm</strong>. The pen instructions say the <strong>lower stomach, keeping 2 inches from your belly button</strong>, the <strong>front of the thighs</strong>, or the upper arm. Inject <strong>once a week</strong>, and change (rotate) the spot each time: the same body area is fine, but not the same spot.</p>`,
    body: `
<h2 id="label">Where the Wegovy label says to inject</h2>
<p>The Wegovy prescribing information (section 2): "Inject WEGOVY subcutaneously in the abdomen, thigh, or upper arm. The time of day and the injection site can be changed without the need for a dosage modification." and "Rotate injection sites with each dose." Wegovy injection is given "once weekly, on the same day each week, at any time of day, with or without meals." The label also says: "Similar exposure was achieved with subcutaneous administration of semaglutide in the abdomen, thigh, or upper arm."</p>
<p>The single-dose pen instructions are more specific:</p>
<ul>
<li>"You may inject into your upper leg (front of the thighs), lower stomach (keep 2 inches away from your belly button) or upper arm."</li>
<li>"Do not inject into an area where the skin is tender, bruised, red, or hard. Avoid injecting into areas with scars or stretch marks."</li>
<li>"You may inject in the same body area each week, but make sure it is not in the same spot each time."</li>
<li>The Medication Guide: "Change (rotate) your injection site with each injection. Do not use the same site for each injection."</li>
</ul>
<p>Wegovy also comes as a single-dose syringe, whose instructions say the back of the upper arm "only with help from someone else" and "Avoid using the exact same spot as the last time between injections", and as the Wegovy FlexTouch pen (4 weekly doses): "Choose an injection site on your upper arms, stomach or upper legs. Keep a distance of 2 inches (5 cm) from your belly button."</p>

<h2 id="how">How to inject Wegovy with the single-dose pen</h2>
<p>The steps from the Wegovy pen Instructions for Use, shortened. Read the full instructions in your box, and ask your doctor or pharmacist to show you the first time.</p>
<ol>
<li><strong>Prepare:</strong> wash your hands and check your pen. Don't use it if it looks used or broken, if the medicine is not clear and colorless in the pen window, or if the expiration date has passed.</li>
<li><strong>Choose your injection site</strong> and clean it with an alcohol swab or soap and water; let the skin dry.</li>
<li><strong>Remove the pen cap:</strong> "Pull the pen cap straight off your pen."</li>
<li><strong>Inject:</strong> "Push the pen firmly against your skin and keep applying pressure until the yellow bar has stopped moving." You will hear 2 clicks: click 1, the injection has started; click 2, the injection is ongoing. "Do not remove the pen from your skin before the yellow bar in the pen window has stopped moving."</li>
<li><strong>Throw away the pen:</strong> "Put the used WEGOVY pen in an FDA-cleared sharps disposal container right away after use."</li>
</ol>
<p><strong>If injecting is hard:</strong> the instructions suggest changing "to a more firm injection site, such as upper leg, or upper arm or consider standing up while injecting into the lower stomach." If medicine appears on the skin, keep pressing until the yellow bar has stopped moving next time.</p>
<h3>Wegovy FlexTouch</h3>
<p>FlexTouch uses a new needle for every injection ("Always use a new needle for each injection"), a flow check as its instructions describe, and after pressing the dose button you "count slowly to 6" with the needle in the skin. "Do not share your pen, Wegovy FlexTouch or needles with other people, even if the needle has been changed."</p>
${notDose('Wegovy')}
<p>Ozempic is the same medicine (semaglutide) in a different pen, with its own instructions: <a href="../ozempic-injection-sites/">Ozempic injection sites</a>.</p>`,
    sources: `
<p class="small">From the US Wegovy label on DailyMed (US National Library of Medicine), label version of 2026-06-18, read on 2026-11-24:</p>
<ul class="small">
<li><a href="${WE}">Wegovy (semaglutide) injection and tablets, Novo Nordisk</a>: prescribing information (section 2 and clinical pharmacology), Medication Guide, and the Instructions for Use for the single-dose pen, the single-dose syringe and Wegovy FlexTouch</li>
</ul>`,
  },
  {
    slug: 'ozempic-injection-sites',
    name: 'Ozempic', generic: 'semaglutide', maker: 'Novo Nordisk', owner: 'Novo Nordisk A/S', device: 'pen',
    title: 'Ozempic injection sites: where to inject and how to rotate',
    h1: 'Ozempic injection sites: where to inject and how to rotate',
    description: 'Where to inject Ozempic, from the US label: stomach (abdomen), thigh or upper arm, a different spot each week. How to inject with the Ozempic pen, insulin in the same area, and a free rotation planner.',
    printSub: 'Ozempic: stomach (abdomen), thigh or upper arm; a different spot each week. New needle every time. With insulin: separate shots, not next to each other.',
    answer: `
<p><strong>Short answer:</strong> inject Ozempic under the skin of your <strong>stomach (abdomen), thigh or upper arm</strong>, once a week on the same day. Use a <strong>different spot each week</strong>, even within the same area. If you also take insulin, give them as <strong>separate injections, never mixed</strong>; the same body area is fine, but not right next to each other.</p>`,
    body: `
<h2 id="label">Where the Ozempic label says to inject</h2>
<p>Section 2 of the Ozempic prescribing information: "Inject OZEMPIC subcutaneously in the abdomen, thigh, or upper arm." It says to "use a different injection site each week when injecting in the same body region," and to give Ozempic "once weekly, on the same day each week, at any time of the day, with or without meals." The label adds that "similar exposure is achieved" with injections in the abdomen, thigh, or upper arm; it names no best area.</p>
<p>The Medication Guide: "Change (rotate) your injection site with each injection. Do not use the same site for each injection." The Ozempic single-dose prefilled syringe instructions spell out the areas: "Stomach area (abdomen) at least 2 inches from the belly button", thighs, and the "Back of upper arm (only with help from someone else)", and "Avoid using the exact same spot as the last time between injections."</p>

<h2 id="insulin">Ozempic and insulin in the same area</h2>
<p>From the prescribing information: "When using OZEMPIC with insulin, instruct patients to administer as separate injections and to never mix the products. It is acceptable to inject OZEMPIC and insulin in the same body region, but the injections should not be adjacent to each other." The Medication Guide: "You may give an injection of OZEMPIC and insulin in the same body area (such as your stomach area), but not right next to each other."</p>

<h2 id="how">How to inject Ozempic with the pen</h2>
<p>The Ozempic pen holds several weekly doses and uses a separate NovoFine Plus needle ("NovoFine® Plus 32G 4 mm disposable needles are included with your OZEMPIC pen"). The main points of its Instructions for Use; read the full instructions, and ask your doctor or pharmacist to show you.</p>
<ol>
<li><strong>A new needle every time:</strong> "Always use a new needle for each injection." "Do not attach a new needle to your pen until you are ready to give your injection."</li>
<li><strong>Flow check, new pens only:</strong> "Check the OZEMPIC flow before the first injection with each new pen only." Turn the dose selector to the flow check symbol, hold the pen needle up and press until the counter shows 0; a drop should appear at the needle tip.</li>
<li><strong>Select your dose</strong> as your prescriber told you. "Do not set the dose by counting the number of clicks you hear."</li>
<li><strong>Inject:</strong> insert the needle as your healthcare provider showed you, keep the dose counter visible, and "Press and hold down the dose button until the dose counter shows 0." Then "Count 6 seconds while keeping the dose button pressed." Remove the needle, then release the button.</li>
<li><strong>After:</strong> "Always dispose of the needle after each injection", into a sharps container, and store the pen without a needle on it.</li>
</ol>
<p>"Do not share your OZEMPIC pen with other people, even if the needle has been changed." If blood appears, press lightly with a gauze pad or cotton ball; don't rub.</p>
${notDose('Ozempic')}
<p>Wegovy is the same medicine (semaglutide) in a single-dose pen: <a href="../wegovy-injection-sites/">Wegovy injection sites</a>. Ozempic in Portuguese and Spanish (Brazilian and Latin American labels): <a href="../pt/onde-aplicar-mounjaro/#ozempic" hreflang="pt-BR" lang="pt-BR">Onde aplicar Ozempic</a> · <a href="../es/donde-aplicar-mounjaro/#ozempic" hreflang="es" lang="es">Dónde aplicar Ozempic</a>.</p>`,
    sources: `
<p class="small">From the US Ozempic label on DailyMed (US National Library of Medicine), label version of 2026-06-01, read on 2026-11-24:</p>
<ul class="small">
<li><a href="${OZ}">Ozempic (semaglutide) injection, Novo Nordisk</a>: prescribing information (section 2 and clinical pharmacology), Medication Guide, and the Instructions for Use for the pen and the single-dose prefilled syringe</li>
</ul>`,
  },
];
