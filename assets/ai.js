// ============================================================
// AI — appel IA générique, multi-fournisseurs.
// Ne connaît rien du métier FAST : reçoit un prompt, renvoie du texte.
// La logique métier (quel coach, quelles réponses) vit dans app.js.
// ============================================================
window.FAST_AI = (function(){
  const C = window.FAST_AI_CONFIG;

  async function interrogerAgentIA(promptFinal){
    if(C.UTILISER_RELAIS){
      return interrogerViaRelais(promptFinal);
    }
    switch(C.FOURNISSEUR_IA){
      case "anthropic": return interrogerAnthropic(promptFinal);
      case "openai":    return interrogerOpenAI(promptFinal);
      case "gemini":    return interrogerGemini(promptFinal);
      case "mistral":   return interrogerMistral(promptFinal);
      default: throw new Error(`Fournisseur IA inconnu : "${C.FOURNISSEUR_IA}"`);
    }
  }

  async function interrogerViaRelais(promptFinal){
    const res = await fetch(C.URL_RELAIS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fournisseur: C.FOURNISSEUR_IA, prompt: promptFinal })
    });
    const donnees = await res.json();
    if(donnees.erreur) throw new Error(donnees.erreur);
    return donnees.reponseIA;
  }

  async function interrogerAnthropic(promptFinal){
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": C.ANTHROPIC.API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: C.ANTHROPIC.MODELE,
        max_tokens: 300,
        messages: [{ role: "user", content: promptFinal }]
      })
    });
    const donnees = await res.json();
    if(donnees.error) throw new Error(donnees.error.message);
    const bloc = (donnees.content || []).find(b => b.type === "text");
    return bloc ? bloc.text.trim() : "";
  }

  async function interrogerOpenAI(promptFinal){
    // ⚠️ OpenAI bloque généralement les appels directs depuis un
    // navigateur (CORS) : passez par UTILISER_RELAIS = true si ça échoue.
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${C.OPENAI.API_KEY}`
      },
      body: JSON.stringify({
        model: C.OPENAI.MODELE,
        messages: [{ role: "user", content: promptFinal }]
      })
    });
    const donnees = await res.json();
    if(donnees.error) throw new Error(donnees.error.message);
    return (donnees.choices?.[0]?.message?.content || "").trim();
  }

  async function interrogerGemini(promptFinal){
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${C.GEMINI.MODELE}:generateContent?key=${C.GEMINI.API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptFinal }] }] })
    });
    const donnees = await res.json();
    if(donnees.error) throw new Error(donnees.error.message);
    return (donnees.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  async function interrogerMistral(promptFinal){
    // ⚠️ Comme OpenAI, peut être bloqué par CORS depuis un navigateur.
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${C.MISTRAL.API_KEY}`
      },
      body: JSON.stringify({
        model: C.MISTRAL.MODELE,
        messages: [{ role: "user", content: promptFinal }]
      })
    });
    const donnees = await res.json();
    if(donnees.error) throw new Error(donnees.error.message || JSON.stringify(donnees.error));
    return (donnees.choices?.[0]?.message?.content || "").trim();
  }

  return { interrogerAgentIA: interrogerAgentIA };
})();
