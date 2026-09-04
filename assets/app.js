// FAST prototype — shared logic across all screens.
// NOTE on storage: a browser page cannot write arbitrary files to disk, or read local
// XML via fetch() unless the site is served over http(s) (opening files directly with
// file:// blocks fetch by CORS in most browsers). This file therefore:
//  - tries fetch() first (works when you serve this folder, e.g. `python3 -m http.server`)
//  - falls back to an embedded copy of the same content (assets/fallback.js) so the
//    prototype still works if opened directly by double-clicking index.html.
//  - "writes a text file" the only way a browser page safely can: it generates the file
//    in memory and triggers a real download, named with date, time and the user's name.
//  - profile / preferences are kept in localStorage, standing in for the requested XML
//    file (same limitation: no direct disk writes from a browser page).

window.FAST = (function(){
  function getLang(){ return localStorage.getItem('fast_lang') || 'fr'; }

  function xmlToDict(xmlText){
    const dict = {};
    try{
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      doc.querySelectorAll('string').forEach(n => { dict[n.getAttribute('key')] = n.textContent; });
    }catch(e){}
    return dict;
  }

  function dict(){
    const lang = getLang();
    return (window.FAST_FALLBACK_I18N && window.FAST_FALLBACK_I18N[lang]) || {};
  }

  async function applyI18n(){
    const lang = getLang();
    let d = (window.FAST_FALLBACK_I18N && window.FAST_FALLBACK_I18N[lang]) || {};
    try{
      const res = await fetch('assets/i18n/' + lang + '.xml');
      if(res.ok){
        const fetched = xmlToDict(await res.text());
        if(Object.keys(fetched).length) d = fetched;
      }
    }catch(e){ /* served via file:// — silently keep the fallback */ }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if(d[k] !== undefined) el.textContent = d[k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph');
      if(d[k] !== undefined) el.setAttribute('placeholder', d[k]);
    });
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
      const k = el.getAttribute('data-i18n-label');
      if(d[k] !== undefined) el.setAttribute('data-label', d[k]);
    });
    document.querySelectorAll('.langbtn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    updateGreeting();
  }

  function setLang(lang){
    localStorage.setItem('fast_lang', lang);
    applyI18n();
  }

  // Interprète un noeud <question> structuré (choix unique/multiple, échelle,
  // oui/non) en objet JS exploitable par le rendu du stepper.
  function parseStructuredQuestionNode(node){
    const type = node.getAttribute('type');
    const required = node.getAttribute('required') === 'true';
    const text = (node.querySelector(':scope > text')?.textContent || '').trim();
    const q = { type: type, required: required, text: text };

    if(type === 'single_choice' || type === 'multi_choice'){
      q.min = node.hasAttribute('min') ? parseInt(node.getAttribute('min'), 10) : (type === 'single_choice' ? 1 : 0);
      q.max = node.hasAttribute('max') ? parseInt(node.getAttribute('max'), 10) : (type === 'single_choice' ? 1 : Infinity);
      q.options = Array.from(node.querySelectorAll(':scope > options > option')).map(o => ({
        label: o.textContent.trim(),
        exclusive: o.getAttribute('exclusive') === 'true',
        needsPrecision: o.getAttribute('needs_precision') === 'true',
        precisionLabel: o.getAttribute('precision_label') || 'Précisez'
      }));
      const otherNode = node.querySelector(':scope > other');
      q.other = otherNode ? { label: otherNode.getAttribute('label') || 'Autre, précisez' } : null;
    }

    if(type === 'scale'){
      const scaleNode = node.querySelector(':scope > scale');
      q.scaleMin = parseInt(scaleNode.getAttribute('min'), 10);
      q.scaleMax = parseInt(scaleNode.getAttribute('max'), 10);
      q.scaleLabels = {};
      Array.from(scaleNode.querySelectorAll(':scope > label')).forEach(l => {
        q.scaleLabels[l.getAttribute('value')] = l.textContent.trim();
      });
      const remarkNode = node.querySelector(':scope > remark');
      q.remark = remarkNode ? { label: remarkNode.getAttribute('label') || 'Remarque, précisez', required: remarkNode.getAttribute('required') === 'true' } : null;
    }

    if(type === 'yes_no'){
      const ifYes = node.querySelector(':scope > if_yes');
      q.ifYes = ifYes ? { label: ifYes.getAttribute('label') || 'Précisez', required: ifYes.getAttribute('required') !== 'false' } : null;
    }

    return q;
  }

  function echapperRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Reconstruit un "état" d'édition (sélections, échelle, oui/non...) à
  // partir d'une réponse déjà enregistrée en texte (qa[i].a) — utilisé
  // quand on rouvre une question structurée pour la modifier mais qu'aucun
  // brouillon compatible n'existe (ex: les questions ont changé de forme
  // depuis la dernière réponse).
  function reconstruireEtat(item, texte){
    const etat = { selection: [], autreActive: false, autreTexte: '', echelle: null, remarque: '', ouiNon: null, precisionOuiNon: '' };
    if(!texte) return etat;

    if(item.type === 'single_choice' || item.type === 'multi_choice'){
      let reste = texte;
      (item.options || []).forEach(function(o){
        if(o.needsPrecision){
          const re = new RegExp('\\(' + echapperRegExp(o.label) + ' : (.*?)\\)');
          const m = reste.match(re);
          if(m){ etat['precision_' + o.label] = m[1]; reste = reste.replace(m[0], '').trim(); }
        }
      });
      reste.split(',').map(p => p.trim()).filter(Boolean).forEach(function(p){
        if(p.indexOf('Autre : ') === 0){
          etat.autreActive = true;
          etat.autreTexte = p.substring('Autre : '.length).trim();
        } else {
          const opt = (item.options || []).find(o => o.label === p);
          if(opt) etat.selection.push(opt.label);
        }
      });

    } else if(item.type === 'scale'){
      let reste = texte;
      const mRemarque = reste.match(/ — Remarque : (.*)$/);
      if(mRemarque){ etat.remarque = mRemarque[1]; reste = reste.slice(0, mRemarque.index); }
      const mValeur = reste.match(/^(-?\d+)/);
      if(mValeur) etat.echelle = parseInt(mValeur[1], 10);

    } else if(item.type === 'yes_no'){
      // On accepte les 4 variantes connues (la réponse a pu être donnée
      // dans une autre langue que celle actuellement affichée).
      const VARIANTES_OUI = ['Oui', 'Yes', 'Sí', 'Da'];
      const VARIANTES_NON = ['Non', 'No', 'Nu'];
      const debutOui = VARIANTES_OUI.find(v => texte.indexOf(v) === 0);
      const debutNon = VARIANTES_NON.find(v => texte.indexOf(v) === 0);
      if(debutOui){
        etat.ouiNon = true;
        const m = texte.match(/ — (.*)$/);
        if(m) etat.precisionOuiNon = m[1];
      } else if(debutNon){
        etat.ouiNon = false;
      }
    }
    return etat;
  }

  async function loadQuestions(setId){
    const lang = getLang();
    let list = (window.FAST_FALLBACK_Q && window.FAST_FALLBACK_Q[setId] && window.FAST_FALLBACK_Q[setId][lang]) || [];
    try{
      const res = await fetch('assets/questions.xml');
      if(res.ok){
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        const sets = Array.from(doc.querySelectorAll('set'));
        const set = sets.find(s => s.getAttribute('id') === setId && s.getAttribute('lang') === lang);
        if(set){
          // Format structuré (choix multiples, échelle, oui/non) si présent,
          // sinon on retombe sur le format texte libre historique.
          const structuredNodes = Array.from(set.querySelectorAll(':scope > question'));
          if(structuredNodes.length){
            list = structuredNodes.map(parseStructuredQuestionNode);
          } else {
            const items = Array.from(set.querySelectorAll(':scope > q')).map(n => n.textContent);
            if(items.length) list = items;
          }
        }
      }
    }catch(e){ /* file:// — keep fallback */ }
    return list;
  }

  // ---- Profile (stands in for the requested profile XML file) ----
  function getProfile(){
    try{ return JSON.parse(localStorage.getItem('fast_profile') || '{}'); }
    catch(e){ return {}; }
  }
  function saveProfile(patch){
    const p = Object.assign(getProfile(), patch);
    localStorage.setItem('fast_profile', JSON.stringify(p));
    updateGreeting();
    return p;
  }
  function updateGreeting(){
    const el = document.getElementById('greetName');
    if(!el) return;
    const p = getProfile();
    el.textContent = p.firstname || dict().home_name_fallback || '';
  }

  // ---- Configuration (reminder frequency, retention) ----
  function getConfig(){
    try{ return JSON.parse(localStorage.getItem('fast_config') || '{}'); }
    catch(e){ return {}; }
  }
  function saveConfig(patch){
    const c = Object.assign(getConfig(), patch);
    localStorage.setItem('fast_config', JSON.stringify(c));
    return c;
  }

  // ---- Answers log + export to a downloadable .txt file ----
  function logAnswers(screen, qaPairs){
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    all.push({ screen: screen, ts: new Date().toISOString(), qa: qaPairs });
    localStorage.setItem('fast_answers', JSON.stringify(all));
  }
  function pad(n){ return String(n).padStart(2, '0'); }
  function exportTxt(){
    const p = getProfile();
    const username = (p.firstname || 'utilisatrice').replace(/[^a-zA-Z0-9_-]/g, '_');
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    let content = 'FAST — export des réponses\nUtilisatrice : ' + username + '\nGénéré le : ' + new Date().toString() + '\n\n';
    if(all.length === 0){ content += '(aucune réponse enregistrée pour le moment)\n'; }
    all.forEach(entry => {
      content += '--- ' + entry.screen + ' (' + entry.ts + ') ---\n';
      entry.qa.forEach(q => { content += 'Q: ' + q.q + '\nR: ' + (q.a || '') + '\n\n'; });
    });
    const now = new Date();
    const stamp = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const filename = 'FAST_reponses_' + username + '_' + stamp + '.txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ---- Synthèse IA à partir des réponses d'un set de questions ----

  // Retrouve les réponses enregistrées pour un écran donné (le plus récent
  // passage, au cas où l'utilisatrice aurait refait le parcours).
  function getAnswersFor(screenId){
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    const entry = all.slice().reverse().find(e => e.screen === screenId);
    return entry ? entry.qa : [];
  }

  // Mémoire "moyen terme" : le profil (Q10+Q5) est-il déjà complet ?
  // Utilisé pour sauter directement à your-question.html et afficher
  // "on vous connaît déjà" plutôt que de reposer les mêmes questions.
  function hasCompletedProfile(){
    return getAnswersFor('q10').length > 0 && getAnswersFor('q5').length > 0;
  }

  // Efface tout ce qui dépend du profil (réponses + synthèses IA en cache +
  // brouillons en cours) — utilisé par le bouton "Refaire le profil".
  function clearProfileData(){
    const all = JSON.parse(localStorage.getItem('fast_answers') || '[]');
    const nettoye = all.filter(e => !['q10', 'q5', 'deepen', 'your-question'].includes(e.screen));
    localStorage.setItem('fast_answers', JSON.stringify(nettoye));
    ['fast_last_synthesis', 'fast_profile_deepening', 'fast_deepen_questions', 'fast_final_synthesis',
     'fast_draft_q10', 'fast_draft_q5', 'fast_draft_deepen'].forEach(k => localStorage.removeItem(k));
  }

  // Réponses vides = section clairement signalée plutôt que silencieusement
  // absente du prompt (utile pour diagnostiquer, et plus honnête envers l'IA).
  function formatAnswersBlock(qaPairs){
    if(!qaPairs || qaPairs.length === 0) return '(aucune réponse enregistrée pour cette section)';
    return qaPairs.map(q => 'Q: ' + q.q + '\nR: ' + (q.a || '')).join('\n\n');
  }

  // Charge le prompt d'un coach depuis assets/prompts.xml (system_prompt +
  // user_prompt, avec les placeholders {ANSWERS_...} à remplacer). Échoue
  // bruyamment (erreur explicite) plutôt que de renvoyer silencieusement un
  // prompt vide — un prompt vide envoyé à l'IA produit une réponse
  // déroutante ("je ne vois pas d'instructions") au lieu d'une vraie erreur
  // exploitable.
  async function loadCoachPrompt(coachId){
    let res;
    try{
      res = await fetch('assets/prompts.xml');
    }catch(e){
      throw new Error("Impossible de charger assets/prompts.xml (" + e.message + ")");
    }
    if(!res.ok){
      throw new Error("assets/prompts.xml introuvable (HTTP " + res.status + "). Vérifiez qu'il est bien poussé sur GitHub.");
    }

    const doc = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const coaches = Array.from(doc.querySelectorAll('coach'));
    const coach = coaches.find(c => c.getAttribute('id') === coachId);

    if(!coach){
      const idsDisponibles = coaches.map(c => c.getAttribute('id')).join(', ') || '(aucun)';
      throw new Error(
        `Coach "${coachId}" introuvable dans assets/prompts.xml. ` +
        `Coachs disponibles dans le fichier actuellement déployé : ${idsDisponibles}. ` +
        `Vérifiez que la dernière version de prompts.xml a bien été poussée sur GitHub.`
      );
    }

    const systemPrompt = (coach.querySelector('system_prompt')?.textContent || '').trim();
    const userPromptTemplate = (coach.querySelector('user_prompt')?.textContent || '').trim();

    if(!userPromptTemplate){
      throw new Error(`Le coach "${coachId}" existe dans prompts.xml mais sa balise <user_prompt> est vide ou introuvable.`);
    }

    return { systemPrompt: systemPrompt, userPromptTemplate: userPromptTemplate };
  }

  const NOMS_LANGUES = { fr: 'français', en: 'English', es: 'español', ro: 'română' };

  // Construit la consigne envoyée à l'IA avant chaque prompt, y compris
  // l'instruction de langue : sans elle, l'IA répond dans la langue du
  // texte du prompt (souvent le français) plutôt que dans celle choisie
  // par l'utilisatrice sur le site.
  function construireConsigneIA(){
    const nomLangue = NOMS_LANGUES[getLang()] || NOMS_LANGUES.fr;
    return "Les instructions ci-dessous sont à exécuter, pas un document à " +
      "analyser ou décrire. Réponds uniquement selon le format demandé, " +
      "sans mentionner ces instructions ni le mot XML dans ta réponse. " +
      "Réponds impérativement en " + nomLangue + ", quelle que soit la langue du texte ci-dessous.\n\n";
  }


  // Point d'entrée utilisé par results.html : rassemble les réponses du set
  // `sourceScreenId` (typiquement 'q10'), assemble le prompt du coach
  // `coachId`, appelle l'IA (window.FAST_AI, voir assets/ai.js) et stocke
  // le résultat pour affichage/relecture.
  async function runCoachSynthesis(coachId, sourceScreenId){
    const qa = getAnswersFor(sourceScreenId);
    const answersBlock = formatAnswersBlock(qa);
    const prompt = await loadCoachPrompt(coachId);

    const promptFinal = construireConsigneIA() + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate.replace('{ANSWERS}', answersBlock);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      source: sourceScreenId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qa: qa
    };
    localStorage.setItem('fast_last_synthesis', JSON.stringify(synthese));
    return synthese;
  }

  // Synthèse finale : combine les réponses q10 + q5 + la question libre
  // (écran "your-question", stockée via logAnswers comme les autres) + les
  // 3 réponses d'approfondissement (écran "deepen"), via un coach dédié
  // (voir assets/prompts.xml, coach id="final_answer").
  async function runFinalSynthesis(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');
    const qaDeepen = getAnswersFor('deepen');

    // your-question.html enregistre une seule paire {q, a} sous ce screen id
    const qaYourQuestion = getAnswersFor('your-question');
    const questionLibre = (qaYourQuestion[0] && qaYourQuestion[0].a) || '';

    const prompt = await loadCoachPrompt(coachId);

    const promptFinal = construireConsigneIA() + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5))
        .replace('{ANSWERS_DEEPEN}', formatAnswersBlock(qaDeepen))
        .replace('{QUESTION_LIBRE}', questionLibre);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qaQ10: qaQ10, qaQ5: qaQ5, qaDeepen: qaDeepen, questionLibre: questionLibre
    };
    localStorage.setItem('fast_final_synthesis', JSON.stringify(synthese));
    return synthese;
  }

  // Approfondissement du profil (Q10 + Q5) : utilisé par
  // results-even-better.html, coach "profile_deepening".
  async function runProfileDeepening(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');

    const prompt = await loadCoachPrompt(coachId);
    const promptFinal = construireConsigneIA() + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5));

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);

    const synthese = {
      coachId: coachId,
      ts: new Date().toISOString(),
      reponseIA: reponseIA,
      qaQ10: qaQ10, qaQ5: qaQ5
    };
    localStorage.setItem('fast_profile_deepening', JSON.stringify(synthese));
    return synthese;
  }

  // Extrait 3 questions d'un texte IA censé répondre avec des lignes
  // "Q: ...". Si l'IA n'a pas respecté le format, on retombe sur les lignes
  // non vides en retirant une éventuelle numérotation/puce.
  function parseTroisQuestions(texteIA){
    const lignes = (texteIA || '').split('\n').map(l => l.trim()).filter(Boolean);
    let questions = lignes
      .filter(l => /^Q:\s*/i.test(l))
      .map(l => l.replace(/^Q:\s*/i, '').trim());
    if(questions.length < 3){
      questions = lignes
        .map(l => l.replace(/^[-*\d.\)]+\s*/, '').trim())
        .filter(Boolean);
    }
    return questions.slice(0, 3);
  }

  // Génère 3 questions de clarification via l'IA (coach
  // "deepen_questions_generator"), à partir du profil (Q10+Q5) et de la
  // question libre posée dans your-question.html. Met en cache le résultat
  // (mêmes réponses + même question => mêmes 3 questions, pas de rappel IA).
  async function generateDeepenQuestions(coachId){
    const qaQ10 = getAnswersFor('q10');
    const qaQ5 = getAnswersFor('q5');
    const qaYourQuestion = getAnswersFor('your-question');
    const questionLibre = (qaYourQuestion[0] && qaYourQuestion[0].a) || '';

    const signatureActuelle = JSON.stringify({ qaQ10: qaQ10, qaQ5: qaQ5, questionLibre: questionLibre });
    const cacheBrut = localStorage.getItem('fast_deepen_questions');
    if(cacheBrut){
      const cache = JSON.parse(cacheBrut);
      if(cache.signature === signatureActuelle && cache.questions && cache.questions.length === 3){
        return cache.questions;
      }
    }

    const prompt = await loadCoachPrompt(coachId);
    const promptFinal = construireConsigneIA() + prompt.systemPrompt + "\n\n" +
      prompt.userPromptTemplate
        .replace('{ANSWERS_Q10}', formatAnswersBlock(qaQ10))
        .replace('{ANSWERS_Q5}', formatAnswersBlock(qaQ5))
        .replace('{QUESTION_LIBRE}', questionLibre);

    const reponseIA = await window.FAST_AI.interrogerAgentIA(promptFinal);
    const questions = parseTroisQuestions(reponseIA);

    if(questions.length < 3){
      throw new Error(
        "L'IA n'a pas renvoyé 3 questions exploitables. Réponse reçue : " +
        reponseIA.slice(0, 200)
      );
    }

    localStorage.setItem('fast_deepen_questions', JSON.stringify({ signature: signatureActuelle, questions: questions }));
    return questions;
  }

  // ---- Generic question-stepper used by q10 / q5 / deepen / new-question screens ----
  // startStepper fait tourner le stepper sur une liste de questions déjà
  // connue (venant de questions.xml OU générée dynamiquement, ex: par l'IA).
  // Chaque item peut être soit une simple chaîne (texte libre, comportement
  // historique), soit un objet structuré (choix unique/multiple, échelle,
  // oui/non — voir parseStructuredQuestionNode).
  // screenId sert de clé de stockage (logAnswers/getAnswersFor) — il peut
  // différer de la source des questions si besoin.
  //
  // Mémoire courte : les réponses en cours sont sauvegardées à chaque
  // changement dans un brouillon (localStorage) et restaurées si l'écran
  // est rechargé ou si l'utilisatrice revient en arrière avant d'avoir
  // terminé — sans jamais régénérer les questions elles-mêmes.
  function startStepper(items, screenId, labelKey, nextUrl){
    const draftKey = 'fast_draft_' + screenId;
    let qa = new Array(items.length);
    let etats = new Array(items.length);
    let i = 0;

    try{
      const brut = localStorage.getItem(draftKey);
      if(brut){
        const draft = JSON.parse(brut);
        if(JSON.stringify(draft.items) === JSON.stringify(items)){
          qa = draft.qa || qa;
          etats = draft.etats || etats;
          i = Math.min(draft.i || 0, items.length - 1);
        }
      }
    }catch(e){ /* brouillon corrompu : on repart de zéro sans bloquer */ }

    // Si aucun brouillon compatible n'a été restauré (questions modifiées
    // depuis, ou brouillon absent) mais que des réponses ont déjà été
    // validées pour cet écran, on reconstruit l'état d'édition à partir de
    // ces réponses plutôt que d'afficher un questionnaire vide.
    const brouillonDejaRempli = qa.filter(Boolean).length > 0;
    if(!brouillonDejaRempli){
      const reponsesFinalisees = getAnswersFor(screenId);
      if(reponsesFinalisees.length === items.length){
        qa = reponsesFinalisees.map(r => ({ q: r.q, a: r.a }));
        etats = items.map((item, idx) =>
          (typeof item === 'object' && item !== null) ? reconstruireEtat(item, qa[idx].a) : undefined
        );
        i = 0;
      }
    }

    const textEl = document.getElementById('q-text');
    const answerEl = document.getElementById('q-answer');
    const optionsEl = document.getElementById('q-options');
    const progressEl = document.getElementById('q-progress');
    const dotsEl = document.getElementById('q-dots');
    const nextEl = document.getElementById('q-next');
    const prevEl = document.getElementById('q-prev');

    function sauverBrouillon(){
      localStorage.setItem(draftKey, JSON.stringify({ items: items, qa: qa, etats: etats, i: i }));
    }
    function estStructuree(item){ return typeof item === 'object' && item !== null; }

    function majBoutonSuivant(){ nextEl.disabled = !estValide(); }

    function estValide(){
      const item = items[i];
      if(!estStructuree(item)) return !!(qa[i] && qa[i].a && qa[i].a.trim());
      if(!item.required) return true;
      const etat = etats[i] || {};
      if(item.type === 'single_choice' || item.type === 'multi_choice'){
        const total = (etat.selection ? etat.selection.length : 0) + (etat.autreActive ? 1 : 0);
        if(total < item.min) return false;
        if(etat.autreActive && !etat.autreTexte) return false;
        const precisionsManquantes = (item.options || []).some(o =>
          o.needsPrecision && etat.selection && etat.selection.includes(o.label) && !etat['precision_' + o.label]
        );
        if(precisionsManquantes) return false;
        return true;
      }
      if(item.type === 'scale'){
        if(etat.echelle === null || etat.echelle === undefined) return false;
        if(item.remark && item.remark.required && !etat.remarque) return false;
        return true;
      }
      if(item.type === 'yes_no'){
        if(etat.ouiNon === null || etat.ouiNon === undefined) return false;
        if(etat.ouiNon === true && item.ifYes && item.ifYes.required && !etat.precisionOuiNon) return false;
        return true;
      }
      return true;
    }

    // ---- Texte libre (comportement historique) ----
    function renderTexte(item){
      optionsEl.style.display = 'none';
      answerEl.style.display = 'block';
      textEl.textContent = item;
      answerEl.value = (qa[i] && qa[i].a) || '';
      answerEl.oninput = function(){
        qa[i] = { q: item, a: answerEl.value };
        sauverBrouillon();
        majBoutonSuivant();
      };
    }

    // ---- Question structurée (choix unique/multiple, échelle, oui/non) ----
    function renderStructuree(item){
      answerEl.style.display = 'none';
      optionsEl.style.display = 'block';
      textEl.textContent = item.text;
      optionsEl.innerHTML = '';

      if(!etats[i]) etats[i] = { selection: [], autreActive: false, autreTexte: '', echelle: null, remarque: '', ouiNon: null, precisionOuiNon: '' };
      const etat = etats[i];

      function recalculerReponse(){
        let a = '';
        if(item.type === 'single_choice' || item.type === 'multi_choice'){
          let a2 = (etat.selection || []).join(', ');
          if(etat.autreActive && etat.autreTexte) a2 = (a2 ? a2 + ', ' : '') + 'Autre : ' + etat.autreTexte;
          (item.options || []).forEach(function(o){
            if(o.needsPrecision && etat.selection && etat.selection.includes(o.label) && etat['precision_' + o.label]){
              a2 += ' (' + o.label + ' : ' + etat['precision_' + o.label] + ')';
            }
          });
          a = a2;
        } else if(item.type === 'scale'){
          if(etat.echelle !== null && etat.echelle !== undefined){
            const lbl = item.scaleLabels[String(etat.echelle)];
            a = lbl ? (etat.echelle + ' — ' + lbl) : String(etat.echelle);
          }
          if(etat.remarque) a += (a ? ' — ' : '') + 'Remarque : ' + etat.remarque;
        } else if(item.type === 'yes_no'){
          const dOuiNon = dict();
          const libOui = dOuiNon.oui_label || 'Oui';
          const libNon = dOuiNon.non_label || 'Non';
          a = etat.ouiNon === true ? libOui : (etat.ouiNon === false ? libNon : '');
          if(etat.ouiNon === true && etat.precisionOuiNon) a += ' — ' + etat.precisionOuiNon;
        }
        qa[i] = { q: item.text, a: a };
        sauverBrouillon();
        majBoutonSuivant();
      }

      function champTexte(valeur, placeholder, onInput){
        const champ = document.createElement('input');
        champ.type = 'text';
        champ.placeholder = placeholder;
        champ.value = valeur || '';
        champ.style.cssText = 'display:block; width:100%; margin:4px 0 10px 26px; padding:7px 8px; border:1px solid #ccc; border-radius:6px; font-size:13px; max-width:calc(100% - 26px);';
        champ.addEventListener('input', function(){ onInput(champ.value); });
        return champ;
      }

      if(item.type === 'single_choice' || item.type === 'multi_choice'){
        const isMulti = item.type === 'multi_choice';
        const exclusifs = (item.options || []).filter(o => o.exclusive).map(o => o.label);

        (item.options || []).forEach(function(opt){
          const ligne = document.createElement('label');
          ligne.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 0; font-size:14px; cursor:pointer;';
          const input = document.createElement('input');
          input.type = isMulti ? 'checkbox' : 'radio';
          input.name = 'q-choice-' + i;
          input.checked = (etat.selection || []).includes(opt.label);
          input.addEventListener('change', function(){
            if(isMulti){
              etat.selection = etat.selection || [];
              if(input.checked){
                if(opt.exclusive){ etat.selection = [opt.label]; etat.autreActive = false; }
                else{ etat.selection = etat.selection.filter(l => !exclusifs.includes(l)); etat.selection.push(opt.label); }
              } else {
                etat.selection = etat.selection.filter(l => l !== opt.label);
              }
            } else {
              etat.selection = [opt.label];
              etat.autreActive = false;
            }
            renderStructuree(item);
          });
          ligne.appendChild(input);
          ligne.appendChild(document.createTextNode(opt.label));
          optionsEl.appendChild(ligne);

          if(opt.needsPrecision && (etat.selection || []).includes(opt.label)){
            optionsEl.appendChild(champTexte(etat['precision_' + opt.label], opt.precisionLabel, function(v){
              etat['precision_' + opt.label] = v;
              recalculerReponse();
            }));
          }
        });

        if(item.other){
          const ligne = document.createElement('label');
          ligne.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 0; font-size:14px; cursor:pointer;';
          const input = document.createElement('input');
          input.type = isMulti ? 'checkbox' : 'radio';
          input.name = 'q-choice-' + i;
          input.checked = !!etat.autreActive;
          input.addEventListener('change', function(){
            if(!isMulti) etat.selection = [];
            else etat.selection = (etat.selection || []).filter(l => !exclusifs.includes(l));
            etat.autreActive = input.checked;
            if(!input.checked) etat.autreTexte = '';
            renderStructuree(item);
          });
          ligne.appendChild(input);
          ligne.appendChild(document.createTextNode(item.other.label));
          optionsEl.appendChild(ligne);

          if(etat.autreActive){
            optionsEl.appendChild(champTexte(etat.autreTexte, item.other.label, function(v){
              etat.autreTexte = v;
              recalculerReponse();
            }));
          }
        }

        if(isMulti){
          const indicateur = document.createElement('p');
          indicateur.style.cssText = 'font-size:11px; color:var(--text-dim); margin-top:6px;';
          const d = dict();
          const libelle = d.choix_possibles_label || 'Choix possibles';
          const connecteur = d.choix_possibles_a || 'à';
          const tousMot = d.choix_possibles_tous || 'tous';
          indicateur.textContent = libelle + ' : ' + item.min + ' ' + connecteur + ' ' + (item.max === Infinity ? tousMot : item.max);
          optionsEl.appendChild(indicateur);
        }

        recalculerReponse();

      } else if(item.type === 'scale'){
        const estEchelleSentiment = (item.scaleMin === -3 && item.scaleMax === 3);

        if(estEchelleSentiment){
          // Échelle graphique : emoji + dégradé de couleur rouge -> vert,
          // avec le libellé du niveau choisi affiché en gros en dessous.
          const EMOJIS = { '-3':'😠', '-2':'🙁', '-1':'😕', '0':'😐', '1':'🙂', '2':'😊', '3':'🤩' };
          const COULEURS = { '-3':'#c0392b', '-2':'#e67e22', '-1':'#f0ad4e', '0':'#95a5a6', '1':'#7fb069', '2':'#27ae60', '3':'#1e8449' };

          const rangee = document.createElement('div');
          rangee.style.cssText = 'display:flex; justify-content:space-between; gap:4px; margin:10px 0 4px;';
          for(let v = item.scaleMin; v <= item.scaleMax; v++){
            const actif = etat.echelle === v;
            const couleur = COULEURS[String(v)];
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.textContent = EMOJIS[String(v)];
            bouton.style.cssText = 'flex:1; font-size:' + (actif ? '26px' : '20px') +
              '; padding:8px 2px; border-radius:10px; border:2px solid ' + (actif ? couleur : 'transparent') +
              '; background:' + (actif ? couleur + '22' : '#f5f5f5') +
              '; cursor:pointer; transition:all .15s;';
            bouton.addEventListener('click', function(){ etat.echelle = v; renderStructuree(item); });
            rangee.appendChild(bouton);
          }
          optionsEl.appendChild(rangee);

          // Piste dégradée sous les emoji, purement visuelle
          const piste = document.createElement('div');
          piste.style.cssText = 'height:6px; border-radius:3px; margin:2px 0 10px; background:linear-gradient(90deg, #c0392b, #e67e22, #f0ad4e, #95a5a6, #7fb069, #27ae60, #1e8449);';
          optionsEl.insertBefore(piste, rangee.nextSibling);

          if(etat.echelle !== null && etat.echelle !== undefined){
            const libelle = document.createElement('p');
            libelle.style.cssText = 'text-align:center; font-weight:600; font-size:14px; margin:0 0 10px; color:' + COULEURS[String(etat.echelle)] + ';';
            libelle.textContent = (item.scaleLabels[String(etat.echelle)] || String(etat.echelle));
            optionsEl.appendChild(libelle);
          }

        } else {
          // Échelle numérique simple (ex: légitimité 1 à 5), sans dégradé.
          const rangee = document.createElement('div');
          rangee.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin:8px 0;';
          for(let v = item.scaleMin; v <= item.scaleMax; v++){
            const bouton = document.createElement('button');
            bouton.type = 'button';
            const actif = etat.echelle === v;
            bouton.textContent = v + (item.scaleLabels[String(v)] ? ' · ' + item.scaleLabels[String(v)] : '');
            bouton.style.cssText = 'padding:8px 10px; border-radius:8px; border:1px solid ' + (actif ? 'var(--rose-deep)' : '#ccc') +
              '; background:' + (actif ? 'var(--rose-deep)' : '#fff') + '; color:' + (actif ? '#fff' : 'inherit') +
              '; font-size:12.5px; cursor:pointer;';
            bouton.addEventListener('click', function(){ etat.echelle = v; renderStructuree(item); });
            rangee.appendChild(bouton);
          }
          optionsEl.appendChild(rangee);
        }

        if(item.remark){
          optionsEl.appendChild(champTexte(etat.remarque, item.remark.label, function(v){
            etat.remarque = v;
            recalculerReponse();
          }));
        }
        recalculerReponse();

      } else if(item.type === 'yes_no'){
        const d = dict();
        const rangee = document.createElement('div');
        rangee.style.cssText = 'display:flex; gap:10px; margin:8px 0;';
        [[d.oui_label || 'Oui', true], [d.non_label || 'Non', false]].forEach(function(paire){
          const label = paire[0], val = paire[1];
          const actif = etat.ouiNon === val;
          const bouton = document.createElement('button');
          bouton.type = 'button';
          bouton.textContent = label;
          bouton.style.cssText = 'flex:1; padding:10px; border-radius:8px; border:1px solid ' + (actif ? 'var(--rose-deep)' : '#ccc') +
            '; background:' + (actif ? 'var(--rose-deep)' : '#fff') + '; color:' + (actif ? '#fff' : 'inherit') +
            '; font-size:14px; cursor:pointer;';
          bouton.addEventListener('click', function(){
            etat.ouiNon = val;
            if(!val) etat.precisionOuiNon = '';
            renderStructuree(item);
          });
          rangee.appendChild(bouton);
        });
        optionsEl.appendChild(rangee);

        if(item.ifYes && etat.ouiNon === true){
          optionsEl.appendChild(champTexte(etat.precisionOuiNon, item.ifYes.label, function(v){
            etat.precisionOuiNon = v;
            recalculerReponse();
          }));
        }
        recalculerReponse();
      }
    }

    function render(){
      const item = items[i];
      if(estStructuree(item)) renderStructuree(item);
      else renderTexte(item);

      const d = dict();
      progressEl.textContent = (d[labelKey] || '') + ' ' + (i+1) + ' / ' + items.length;
      dotsEl.innerHTML = items.map((_, idx) => '<div class="dot ' + (idx <= i ? 'done' : '') + '"></div>').join('');
      nextEl.textContent = (i === items.length - 1) ? (d.nav_finish || 'Terminer') : (d.nav_next || 'Suivant');
      majBoutonSuivant();
    }

    prevEl.addEventListener('click', function(){ if(i > 0){ i--; sauverBrouillon(); render(); } });
    nextEl.addEventListener('click', function(){
      if(!estValide()) return;
      if(i < items.length - 1){ i++; sauverBrouillon(); render(); }
      else{
        logAnswers(screenId, qa);
        sauverBrouillon(); // on garde volontairement le brouillon : un retour
        // ultérieur sur cet écran (ex: depuis results.html) doit retrouver
        // exactement ces réponses, pas repartir de zéro.
        window.location.href = nextUrl;
      }
    });
    render();
  }

  // Version historique : va chercher les questions dans questions.xml avant
  // de démarrer le stepper. Conservée telle quelle pour q10 / q5 / nq.
  async function runStepper(setId, labelKey, nextUrl){
    const items = await loadQuestions(setId);
    startStepper(items, setId, labelKey, nextUrl);
  }


  function openMenu(){ document.getElementById('menuOverlay').classList.add('open'); }
  function closeMenu(){ document.getElementById('menuOverlay').classList.remove('open'); }

  function selectFeel(el){
    el.parentElement.querySelectorAll('.feel').forEach(f => f.classList.remove('sel'));
    el.classList.add('sel');
  }
  function selectRadio(el, groupName){
    el.parentElement.querySelectorAll('.radio-opt').forEach(f => f.classList.remove('sel'));
    el.classList.add('sel');
    el.parentElement.dataset.selected = el.dataset.value;
  }


  
  function init(){ applyI18n(); }

  return {
    getLang: getLang, setLang: setLang, applyI18n: applyI18n, dict: dict,
    loadQuestions: loadQuestions, runStepper: runStepper,
    getProfile: getProfile, saveProfile: saveProfile,
    getConfig: getConfig, saveConfig: saveConfig,
    logAnswers: logAnswers, exportTxt: exportTxt,
    getAnswersFor: getAnswersFor, runCoachSynthesis: runCoachSynthesis,
    hasCompletedProfile: hasCompletedProfile, clearProfileData: clearProfileData,
    runFinalSynthesis: runFinalSynthesis,
    runProfileDeepening: runProfileDeepening,
    generateDeepenQuestions: generateDeepenQuestions,
    startStepper: startStepper,
    openMenu: openMenu, closeMenu: closeMenu,
    selectFeel: selectFeel, selectRadio: selectRadio,
    init: init
  };
})();

// ==========================================
// Composant Web Centralisé pour le Menu
// ==========================================
class FastHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="statusbar">
        <span>9:41</span>
         <button class="menubtn" onclick="FAST.openMenu()" aria-label="Menu" style="background:none; border:none; font-size:20px; cursor:pointer; color: var(--text, #000);">&#9776;</button>
      </div>
      <div class="menu-overlay" id="menuOverlay" onclick="if(event.target===this) FAST.closeMenu()">
        <div class="menu-panel">
          <a class="menu-item" href="index.html" data-i18n="menu_accueil">Accueil</a>
          <a class="menu-item" href="profile.html" data-i18n="menu_profil">Profil</a>
          <a class="menu-item" href="who-am-i.html" data-i18n="menu_whoami">Qui suis-je</a>
          <a class="menu-item" href="config.html" data-i18n="menu_config">Configuration</a>
          <a class="menu-item" href="subscription.html" data-i18n="menu_subscription">Abonnement</a>
          <a class="menu-item" href="index.html" data-i18n="menu_deconnexion">Se déconnecter</a>
        </div>
      </div>
    `;
  }
}
customElements.define('fast-header', FastHeader);

document.addEventListener('DOMContentLoaded', FAST.init);
