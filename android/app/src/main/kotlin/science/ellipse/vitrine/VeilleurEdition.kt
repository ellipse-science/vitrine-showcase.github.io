package science.ellipse.vitrine

/**
 * Surveille la parution d'une nouvelle édition.
 *
 * Transposition de `components/interactive/ActualisationAuto.tsx`, et pour la
 * même raison : les données sont inlinées dans le HTML au build, donc une page
 * gardée en mémoire est une édition figée. Deux caches se superposent ici
 * (celui de la vue web et le service worker du site) ; sans cette sonde,
 * quelqu'un qui laisse l'application ouverte peut relire pendant des jours la
 * même Une.
 *
 * Sans état persistant : la référence vit le temps du processus, ce qui suffit,
 * puisqu'un redémarrage recharge la page de toute façon.
 */
class VeilleurEdition {
    private var reference: String? = null

    /**
     * Renvoie `true` si une édition plus récente est parue depuis le dernier
     * appel. Le premier appel pose la référence et renvoie toujours `false`.
     *
     * Bloquant : à appeler depuis un fil d'arrière-plan.
     */
    fun editionPlusRecente(): Boolean {
        val brut = Lecteur.lire(Vitrine.IDENTIFIANT_BUILD) ?: return false
        val build = IdentifiantBuild.depuisJson(brut) ?: return false
        val connue = reference
        reference = build.id
        // Hors ligne, vieux déploiement sans le fichier, JSON illisible : la
        // sonde se tait et l'application continue de fonctionner.
        return connue != null && connue != build.id
    }
}
