// ============================================================
// FLOW-CONFIG — choix du parcours de fin
// Sur un site statique, il n'existe pas de vraie variable
// d'environnement (le navigateur n'y a pas accès) : cette
// constante en tient lieu — modifiez sa valeur avant déploiement.
// ============================================================
window.FAST_FLOW_CONFIG = {
  // "affichage" = la réponse finale s'affiche directement sur
  //               final-response.html (comportement actuel)
  // "email"     = après calcul de la réponse, redirige vers le parcours
  //               email-sent.html -> engagement.html -> finalize-account.html
  //               -> coaching-hub.html, au lieu de l'afficher ici.
  //               NB : ce site étant statique (pas de backend), aucun email
  //               n'est réellement envoyé — ce mode simule uniquement la
  //               redirection vers cet écran de confirmation.
  MODE_FINAL: "affichage"
};
