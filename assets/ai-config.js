// ============================================================
// AI-CONFIG — à adapter avant déploiement
// Sur un site statique, il n'existe pas de vraie variable
// d'environnement (le navigateur n'y a pas accès) : ces valeurs
// en tiennent lieu.
// ============================================================
window.FAST_AI_CONFIG = {
  CHEMIN_PROMPTS: "assets/prompts.xml",

  // "anthropic" | "openai" | "gemini" | "mistral"
  FOURNISSEUR_IA: "anthropic",

  // false = appel direct au fournisseur depuis ce navigateur (clé visible).
  // true  = passe par un relais serverless qui cache la clé (voir /relais-ia).
  UTILISER_RELAIS: true,
  URL_RELAIS: "https://bold-math-50b2-relais-ia-fast-project.b00830790.workers.dev",

  // ⚠️ Visibles côté client si UTILISER_RELAIS = false : uniquement pour
  // un prototype/démo, jamais pour un déploiement public avec une clé
  // payante active.
  ANTHROPIC: {
    API_KEY: "DDDD",
    MODELE: "claude-sonnet-4-6"
    //
  },
  OPENAI: {
    API_KEY: "OOO",
   MODELE: "gpt-4o-mini"
    
  },
  GEMINI: {
    API_KEY: "",
    MODELE: "gemini-2.0-flash"
  },
  MISTRAL:   { 
    API_KEY: "REMPLACEZ_PAR_VOTRE_CLE_API", 
    MODELE: "mistral-small-latest" }
};
