// ============================================================
// RELAIS IA — Cloudflare Worker
//
// Rôle : recevoir { fournisseur, prompt } depuis le site statique,
// appeler le VRAI fournisseur IA depuis le serveur (donc pas de CORS,
// et la clé API reste secrète — jamais envoyée au navigateur), puis
// renvoyer { reponseIA }.
//
// Les clés API sont lues dans des variables d'environnement /secrets
// Cloudflare (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
// MISTRAL_API_KEY) — voir README-relais.md pour les configurer.
// ============================================================

// Domaine(s) autorisé(s) à appeler ce relais.
// Remplacez par l'adresse exacte de votre site GitHub Pages.
const ORIGINE_AUTORISEE = "https://martin-brochet-essec.github.io";

function enTetesCORS() {
  return {
    "Access-Control-Allow-Origin": ORIGINE_AUTORISEE,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(requete, env) {
    // Pré-vol CORS envoyé automatiquement par le navigateur
    if (requete.method === "OPTIONS") {
      return new Response(null, { headers: enTetesCORS() });
    }

    if (requete.method !== "POST") {
      return new Response("Méthode non autorisée", { status: 405, headers: enTetesCORS() });
    }

    try {
      const { fournisseur, prompt } = await requete.json();

      let reponseIA;
      switch (fournisseur) {
        case "anthropic": reponseIA = await appelerAnthropic(prompt, env); break;
        case "openai":    reponseIA = await appelerOpenAI(prompt, env);    break;
        case "gemini":    reponseIA = await appelerGemini(prompt, env);    break;
        case "mistral":   reponseIA = await appelerMistral(prompt, env);   break;
        default:
          return new Response(JSON.stringify({ erreur: `Fournisseur inconnu : ${fournisseur}` }),
            { status: 400, headers: { ...enTetesCORS(), "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ reponseIA }), {
        headers: { ...enTetesCORS(), "Content-Type": "application/json" }
      });

    } catch (erreur) {
      return new Response(JSON.stringify({ erreur: erreur.message }), {
        status: 500,
        headers: { ...enTetesCORS(), "Content-Type": "application/json" }
      });
    }
  }
};

// ------------------------------------------------------------
// Un appel par fournisseur — même logique que côté navigateur,
// mais exécutée ici le secret ne quitte jamais ce serveur.
// ------------------------------------------------------------

async function appelerAnthropic(prompt, env) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const donnees = await res.json();
  if (donnees.error) throw new Error(donnees.error.message);
  const bloc = (donnees.content || []).find((b) => b.type === "text");
  return bloc ? bloc.text.trim() : "";
}

async function appelerOpenAI(prompt, env) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });
  const donnees = await res.json();
  if (donnees.error) throw new Error(donnees.error.message);
  return (donnees.choices?.[0]?.message?.content || "").trim();
}

async function appelerGemini(prompt, env) {
  const modele = env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const donnees = await res.json();
  if (donnees.error) throw new Error(donnees.error.message);
  return (donnees.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

async function appelerMistral(prompt, env) {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: env.MISTRAL_MODEL || "mistral-small-latest",
      messages: [{ role: "user", content: prompt }]
    })
  });
  const donnees = await res.json();
  if (donnees.error) throw new Error(donnees.error.message || JSON.stringify(donnees.error));
  return (donnees.choices?.[0]?.message?.content || "").trim();
}
