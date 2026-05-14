/* eslint-disable react/no-unescaped-entities, max-len */
import React, { memo, ReactElement } from 'react';

import InfoPage from '../InfoPage/InfoPage';
import './MethodologyPage.scss';

const MethodologyPage = (): ReactElement => {
  const handlePrint = () => window.print();

  return (
    <InfoPage
      slug="methodology"
      eyebrow="Vitrine Démocratique"
      title={<span className="has-font-secondary">Méthodologie</span>}
      description="Comment nous mesurons la saillance dans les trois sphères de l'espace public québécois et canadien."
    >

      {/* ── Table des matières ──────────────────────────────────── */}
      <section className="InfoPage-section section-outer Metho-toc-section">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">Table des matières</h2>
          <ol className="Metho-toc">
            <li><a href="#cadre-conceptuel">Cadre conceptuel</a></li>
            <li><a href="#collecte-medias">Architecture de collecte — Médias</a></li>
            <li><a href="#indice-saillance">L'indice de saillance</a></li>
            <li><a href="#une-des-unes">Module : La Une des Unes</a></li>
            <li><a href="#treemap-enjeux">Module : Carte des enjeux (Treemap)</a></li>
            <li><a href="#couverture-partis">Module : Couverture des partis politiques (médias)</a></li>
            <li><a href="#constellation">Module : Constellation médiatique</a></li>
            <li><a href="#parole-en-chambre">Module : Parole en chambre</a></li>
            <li><a href="#partis-parlement">Module : Partis politiques — Parlement</a></li>
            <li><a href="#opinion-publique">Module : Opinion publique citoyenne</a></li>
            <li><a href="#fenetres-temporelles">Fenêtres temporelles et pondérations</a></li>
            <li><a href="#limites">Limites reconnues</a></li>
            <li><a href="#ethique">Éthique et transparence</a></li>
            <li><a href="#citation">Citation et accès aux données</a></li>
          </ol>
        </div>
      </section>

      {/* ── §1 Cadre conceptuel ──────────────────────────────────── */}
      <section id="cadre-conceptuel" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§1 — Cadre conceptuel</h2>
          <p className="InfoPage-text">
            La <strong>saillance</strong> est définie comme la prépondérance relative d'un enjeu, d'un acteur ou
            d'une institution dans une sphère d'activité publique donnée, à un moment précis. Ce concept s'inscrit
            dans la tradition de la théorie de l'agenda-setting (McCombs &amp; Shaw, 1972; Iyengar &amp; Kinder,
            1987), selon laquelle les médias, les élus et les citoyens se co-influencent mutuellement dans la
            construction de l'agenda public.
          </p>
          <p className="InfoPage-text">
            La Vitrine Démocratique mesure trois dimensions complémentaires de la saillance :
          </p>
          <ol className="Metho-numbered-list">
            <li>
              <strong>Saillance médiatique</strong> — la présence d'un enjeu ou d'un acteur sur les pages frontales
              des principaux médias québécois et canadiens, pondérée par la durée et la position.
            </li>
            <li>
              <strong>Saillance parlementaire</strong> — la part du discours législatif (débats à l'Assemblée
              nationale du Québec et à la Chambre des communes) consacrée à un enjeu ou à un acteur.
            </li>
            <li>
              <strong>Préoccupations citoyennes</strong> — les priorités déclarées des Québécois·es mesurées
              quotidiennement par sondage en ligne.
            </li>
          </ol>
          <p className="InfoPage-text">
            Ces trois mesures sont indépendantes l'une de l'autre et ne sont pas agrégées en un indice composite.
            Leur rapprochement sur une même interface vise à offrir une vue triangulée de l'espace public, sans
            présumer d'une hiérarchie entre ces sphères.
          </p>
        </div>
      </section>

      {/* ── §2 Collecte médias ───────────────────────────────────── */}
      <section id="collecte-medias" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§2 — Architecture de collecte — Médias</h2>

          <h3 className="Metho-h3">Capture continue des pages frontales</h3>
          <p className="InfoPage-text">
            Le système Radar+, développé et opéré par l'équipe Ellipse Sciences de la CLESSN, effectue une
            capture automatique des pages d'accueil de <strong>13 sources d'information</strong> toutes les
            dix minutes environ, et ce de manière ininterrompue depuis septembre 2018. Cette collecte est
            longitudinale, en temps quasi réel, et horodatée en UTC.
          </p>
          <p className="InfoPage-text">
            Pour chaque capture sont enregistrés : la structure HTML de la page, la position verticale et le
            gabarit visuel de chaque manchette, ainsi que le moment précis de l'extraction.
          </p>

          <div className="Metho-table-wrapper">
            <table className="Metho-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Source</th>
                  <th>Langue</th>
                  <th>Temps moyen en Une (min)</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>JDM</td><td>Journal de Montréal</td><td>Français</td><td>143</td></tr>
                <tr><td>LAP</td><td>La Presse</td><td>Français</td><td>121</td></tr>
                <tr><td>LED</td><td>Le Devoir</td><td>Français</td><td>242</td></tr>
                <tr><td>RCI</td><td>Radio-Canada Info</td><td>Français</td><td>160</td></tr>
                <tr><td>TVA</td><td>TVA Nouvelles</td><td>Français</td><td>125</td></tr>
                <tr><td>MG</td><td>Métro</td><td>Français</td><td>241</td></tr>
                <tr><td>CBC</td><td>CBC News</td><td>Anglais</td><td>159</td></tr>
                <tr><td>CTV</td><td>CTV News</td><td>Anglais</td><td>228</td></tr>
                <tr><td>GAM</td><td>Globe &amp; Mail</td><td>Anglais</td><td>326</td></tr>
                <tr><td>GN</td><td>Global News</td><td>Anglais</td><td>375</td></tr>
                <tr><td>NP</td><td>National Post</td><td>Anglais</td><td>249</td></tr>
                <tr><td>TTS</td><td>Toronto Star</td><td>Anglais</td><td>221</td></tr>
                <tr><td>VS</td><td>Vancouver Sun</td><td>Anglais</td><td>505</td></tr>
              </tbody>
            </table>
            <p className="Metho-table-note">
              Le temps moyen en Une est calculé sur trois mois glissants et sert à pondérer l'indice de saillance
              inter-médias (voir §3).
            </p>
          </div>

          <h3 className="Metho-h3">Collecte des articles (corps de texte)</h3>
          <p className="InfoPage-text">
            En parallèle des captures de pages frontales, le système extrait également le contenu textuel
            (titre, corps, auteur·e, source) des articles publiés par ces mêmes médias. Ces articles alimentent
            les modules de couverture par enjeux et par partis politiques (§5 et §6).
          </p>

          <h3 className="Metho-h3">Extraction des entités nommées</h3>
          <p className="InfoPage-text">
            Les objets présents dans les manchettes (personnes, enjeux, institutions, lieux) sont identifiés par
            deux modèles d'intelligence artificielle complémentaires :
          </p>
          <ul className="Metho-bullet-list">
            <li>
              <strong>GLiNER</strong> — modèle de reconnaissance d'entités nommées (NER) appliqué directement
              au texte des manchettes. GLiNER est un modèle léger entraîné pour détecter des catégories
              d'entités définies à la demande, sans nécessiter de reclassification.
            </li>
            <li>
              <strong>Gemma 3</strong> — grand modèle de langage (LLM) utilisé pour normaliser les entités
              extraites en français et en anglais (ex. : « Justin Trudeau » et « Trudeau » renvoient au même
              objet normalisé).
            </li>
          </ul>
          <p className="InfoPage-text">
            La performance des modèles est évaluée régulièrement par comparaison à un jeu de référence d'environ
            1 500 phrases annotées manuellement, permettant de quantifier les taux d'erreur et de valider chaque
            mise à jour des modèles.
          </p>
        </div>
      </section>

      {/* ── §3 Indice de saillance ───────────────────────────────── */}
      <section id="indice-saillance" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§3 — L'indice de saillance</h2>
          <p className="InfoPage-text">
            La saillance d'un objet est mesurée à partir de deux dimensions principales : le{' '}
            <strong>temps de présence en Une</strong> (durée pendant laquelle l'objet occupe la page frontale
            d'un média) et la <strong>position verticale</strong> dans la hiérarchie de la page. Ces deux
            dimensions sont combinées en blocs de quatre heures UTC (00–04h, 04–08h, 08–12h, 12–16h,
            16–20h, 20–24h), qui constituent l'unité temporelle de base de l'analyse.
          </p>

          <h3 className="Metho-h3">Indice absolu de saillance</h3>
          <p className="InfoPage-text">
            Pour chaque objet <em>o</em>, chaque média <em>m</em> et chaque bloc temporel <em>t</em>,
            l'indice absolu est calculé comme suit :
          </p>
          <div className="Metho-formula">
            <code>
              IndiceAbsolu(<em>o</em>, <em>m</em>, <em>t</em>) = TempsEnUne(<em>o</em>, <em>m</em>, <em>t</em>) × PondérationMédia(<em>m</em>)
            </code>
          </div>
          <p className="InfoPage-text">
            La <strong>pondération inter-médias</strong> corrige les disparités structurelles entre sources :
            certains médias renouvellent leur page frontale très fréquemment (temps moyen en Une court),
            tandis que d'autres la laissent stable pendant plusieurs heures. Sans correction, les premières
            sources accumuleraient mécaniquement moins de durée brute que les secondes, même pour une histoire
            de même importance. La pondération est calculée sur la base du temps moyen historique passé en
            Une par chaque média sur une fenêtre de trois mois glissants.
          </p>

          <h3 className="Metho-h3">Indice relatif (normalisé)</h3>
          <p className="InfoPage-text">
            L'indice absolu est normalisé par la somme des indices de tous les objets présents dans le même
            bloc temporel, produisant une part relative :
          </p>
          <div className="Metho-formula">
            <code>
              IndiceRelatif(<em>o</em>, <em>t</em>) = IndiceAbsolu(<em>o</em>, <em>t</em>) / Σ IndiceAbsolu(<em>tous objets</em>, <em>t</em>)
            </code>
          </div>
          <p className="InfoPage-text">
            Cet indice exprime, pour chaque bloc de quatre heures, quelle proportion de l'attention médiatique
            totale est consacrée à un objet donné. Il est recalculé à chaque nouveau bloc.
          </p>
        </div>
      </section>

      {/* ── §4 La Une des Unes ───────────────────────────────────── */}
      <section id="une-des-unes" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§4 — Module : La Une des Unes</h2>
          <p className="InfoPage-text">
            Ce module identifie, en temps quasi réel, l'objet (enjeu, personne ou institution) qui domine le
            plus l'agenda des médias québécois et canadiens au moment de la consultation.
          </p>

          <h3 className="Metho-h3">Algorithme</h3>
          <ol className="Metho-numbered-list">
            <li>
              Pour chaque bloc de quatre heures, les indices de saillance absolus et relatifs sont calculés
              pour l'ensemble des objets présents sur les pages frontales des 13 médias.
            </li>
            <li>
              Les objets sont agrégés sur les blocs récents par sommation des indices relatifs normalisés,
              en donnant plus de poids aux blocs les plus récents.
            </li>
            <li>
              L'objet ayant accumulé le score agrégé le plus élevé devient la « Une des Unes » pour la
              période en cours.
            </li>
            <li>
              Pour chaque média du corpus, on vérifie si cet objet est présent sur sa page frontale et à
              quel niveau de saillance.
            </li>
          </ol>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            L'interface présente : un résumé éditorial de l'histoire dominante (généré par LLM à partir des
            manchettes représentatives), une grille indiquant quels médias couvrent l'histoire et à quelle
            intensité, et des liens vers des articles sources. L'utilisateur peut basculer entre une
            vue <strong>Québec</strong> (médias francophones) et <strong>Canada</strong> (ensemble du corpus).
          </p>
        </div>
      </section>

      {/* ── §5 Treemap des enjeux ────────────────────────────────── */}
      <section id="treemap-enjeux" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§5 — Module : Carte des enjeux (Treemap)</h2>
          <p className="InfoPage-text">
            Ce module représente la distribution de la couverture médiatique par grand enjeu de société
            (économie, santé, environnement, politique, etc.) sur la période sélectionnée.
          </p>

          <h3 className="Metho-h3">Source des données</h3>
          <p className="InfoPage-text">
            Le corpus d'articles médiatiques collectés quotidiennement (même panel de 13 sources que §2),
            stocké dans la table <code className="Metho-inline-code">r-media-headlines</code>.
          </p>

          <h3 className="Metho-h3">Algorithme</h3>
          <ol className="Metho-numbered-list">
            <li>
              Chaque article est découpé en phrases individuelles par un algorithme de segmentation basé
              sur la ponctuation finale (point suivi d'une majuscule), avec gestion des abréviations courantes
              (ex. : « M. », « Dr. »).
            </li>
            <li>
              Un <strong>dictionnaire d'enjeux à deux niveaux</strong>{' '}
              (<code className="Metho-inline-code">dict-issues-two-categories</code>) est appliqué à chaque
              phrase via la bibliothèque <code className="Metho-inline-code">quanteda</code>. Ce dictionnaire
              associe chaque mot ou expression à une catégorie thématique et une sous-catégorie.
            </li>
            <li>
              Pour chaque phrase contenant au moins un terme du dictionnaire, un score de pertinence est
              calculé : nombre de mentions de l'enjeu divisé par le nombre total de mots de la phrase
              (score proportionnel à la densité thématique).
            </li>
            <li>
              Les scores sont agrégés par enjeu et par jour, puis pondérés temporellement selon la fenêtre
              sélectionnée (voir §11).
            </li>
          </ol>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Un treemap où la superficie de chaque cellule est proportionnelle au score de saillance cumulé
            de l'enjeu sur la période. La sélection d'une cellule affiche les manchettes représentatives
            et un indicateur de vélocité (tendance par rapport à la période précédente).
          </p>
        </div>
      </section>

      {/* ── §6 Couverture des partis (médias) ───────────────────── */}
      <section id="couverture-partis" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§6 — Module : Couverture des partis politiques (médias)</h2>
          <p className="InfoPage-text">
            Ce module mesure la <strong>part de voix</strong> (share of voice) et le <strong>ton</strong>{' '}
            des partis politiques dans la couverture médiatique québécoise et canadienne.
          </p>

          <h3 className="Metho-h3">Partis suivis</h3>
          <div className="Metho-table-wrapper">
            <table className="Metho-table">
              <thead>
                <tr><th>Palier</th><th>Parti</th><th>Code interne</th></tr>
              </thead>
              <tbody>
                <tr><td rowSpan={6} className="Metho-rowspan">Fédéral</td><td>Parti libéral du Canada (PLC)</td><td><code>lpc</code></td></tr>
                <tr><td>Parti conservateur du Canada (PCC)</td><td><code>cpc</code></td></tr>
                <tr><td>Nouveau Parti démocratique (NPD)</td><td><code>ndp</code></td></tr>
                <tr><td>Bloc québécois (BQ)</td><td><code>bq</code></td></tr>
                <tr><td>Parti vert du Canada (PVC)</td><td><code>gpc</code></td></tr>
                <tr><td>Parti populaire du Canada (PPC)</td><td><code>ppc</code></td></tr>
                <tr><td rowSpan={5} className="Metho-rowspan">Provincial (QC)</td><td>Coalition avenir Québec (CAQ)</td><td><code>caq</code></td></tr>
                <tr><td>Parti québécois (PQ)</td><td><code>pq</code></td></tr>
                <tr><td>Parti libéral du Québec (PLQ)</td><td><code>plq</code></td></tr>
                <tr><td>Québec solidaire (QS)</td><td><code>qs</code></td></tr>
                <tr><td>Parti conservateur du Québec (PCQ)</td><td><code>pcq</code></td></tr>
              </tbody>
            </table>
          </div>

          <h3 className="Metho-h3">Algorithme</h3>
          <ol className="Metho-numbered-list">
            <li>
              Les articles sont segmentés en phrases (même méthode qu'au §5).
            </li>
            <li>
              Deux dictionnaires sont appliqués simultanément à chaque phrase via{' '}
              <code className="Metho-inline-code">quanteda</code> :{' '}
              (a) le dictionnaire des partis politiques, qui recense les noms, acronymes et surnoms
              associés à chaque organisation ; (b) le dictionnaire de sentiment, qui catégorise les
              mots en quatre classes : <em>positif</em>, <em>négatif</em>, <em>négation du positif</em>{' '}
              et <em>négation du négatif</em>.
            </li>
            <li>
              <strong>Score de pertinence</strong> par parti et par phrase :
              <div className="Metho-formula">
                <code>Pertinence(<em>parti</em>, <em>phrase</em>) = mentions_parti / total_mots_phrase</code>
              </div>
            </li>
            <li>
              <strong>Ton net</strong> par phrase :
              <div className="Metho-formula">
                <code>Ton(<em>phrase</em>) = (positifs + nég_négatifs − négatifs − nég_positifs) / total_mots_phrase</code>
              </div>
            </li>
            <li>
              Agrégation journalière des scores, puis pondération temporelle décroissante (voir §11).
            </li>
            <li>
              Normalisation relative pour produire une <strong>part de voix</strong> : score de chaque
              parti divisé par la somme des scores de tous les partis du même palier.
            </li>
          </ol>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Classement des partis par part de voix sur la période sélectionnée, accompagné de sparklines
            représentant l'évolution sur 7 jours et d'un indicateur de ton moyen (positif, neutre, négatif).
            L'utilisateur peut basculer entre le palier provincial et fédéral.
          </p>
        </div>
      </section>

      {/* ── §7 Constellation ─────────────────────────────────────── */}
      <section id="constellation" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§7 — Module : Constellation médiatique</h2>
          <p className="InfoPage-text">
            Ce module visualise les liens entre sujets saillants à travers un graphe de co-occurrence
            des entités présentes sur les pages frontales médiatiques.
          </p>

          <h3 className="Metho-h3">Construction du graphe</h3>
          <ul className="Metho-bullet-list">
            <li>
              <strong>Nœuds</strong> : chaque entité nommée (enjeu, personne, institution, lieu)
              ayant atteint un seuil minimal de saillance dans la période analysée.
            </li>
            <li>
              <strong>Arêtes</strong> : une arête relie deux entités lorsqu'elles apparaissent
              simultanément sur la page frontale d'un même média dans le même bloc temporel. Le
              poids de l'arête est proportionnel à la fréquence de co-occurrence, pondérée par
              l'indice de saillance des deux entités.
            </li>
            <li>
              <strong>Taille des nœuds</strong> : proportionnelle à l'indice de saillance cumulé
              de l'entité sur la période.
            </li>
          </ul>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Graphe force-directed interactif (algorithme de simulation physique de répulsion/attraction).
            La sélection d'un nœud affiche les articles sources correspondants et la distribution de
            la couverture par média. Un sélecteur permet de basculer entre la vue Québec et Canada.
          </p>
        </div>
      </section>

      {/* ── §8 Parole en chambre ─────────────────────────────────── */}
      <section id="parole-en-chambre" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§8 — Module : Parole en chambre</h2>
          <p className="InfoPage-text">
            Ce module mesure quels enjeux dominent les débats législatifs, en termes de volume de discours
            consacré à chaque thématique.
          </p>

          <h3 className="Metho-h3">Sources des données</h3>
          <ul className="Metho-bullet-list">
            <li>
              <strong>Assemblée nationale du Québec (ANQ)</strong> : journal des débats en séance plénière
              et en commission parlementaire, extrait automatiquement via le portail officiel.
            </li>
            <li>
              <strong>Chambre des communes du Canada</strong> : journal des débats (Hansard),
              extrait via les API et portails officiels du Parlement canadien.
            </li>
          </ul>

          <h3 className="Metho-h3">Algorithme</h3>
          <p className="InfoPage-text">
            Le traitement des transcripts parlementaires suit le même pipeline que celui des articles
            médiatiques (§5) : segmentation en phrases, application du dictionnaire d'enjeux, calcul
            du score de pertinence par thématique, agrégation journalière et pondération temporelle.
            Les métadonnées associées (parti du ou de la député·e, assemblée, date d'intervention)
            permettent de ventiler les résultats par organisation politique et par chambre.
          </p>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Enjeux dominants dans les débats, avec distribution par parti politique et indicateur de
            vélocité. Un sélecteur permet de choisir entre l'Assemblée nationale et la Chambre des
            communes.
          </p>
        </div>
      </section>

      {/* ── §9 Partis — Parlement ────────────────────────────────── */}
      <section id="partis-parlement" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§9 — Module : Partis politiques — Parlement</h2>
          <p className="InfoPage-text">
            Version parlementaire du module de couverture des partis (§6). Ce module mesure la présence et
            le ton des partis politiques dans les débats législatifs.
          </p>

          <h3 className="Metho-h3">Sources et algorithme</h3>
          <p className="InfoPage-text">
            Mêmes transcripts que §8 (ANQ et Chambre des communes). Le pipeline d'analyse est identique
            à §6 : application simultanée des dictionnaires de partis et de sentiment, calcul du score
            de pertinence et du ton net, agrégation avec pondération temporelle décroissante. La part
            de discours est calculée au niveau de chaque phrase attribuée à un parti donné.
          </p>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Classement des partis par proportion du discours parlementaire, accompagné d'indicateurs
            de ton (positif / neutre / négatif) et de sparklines de tendance.
          </p>
        </div>
      </section>

      {/* ── §10 Opinion publique ─────────────────────────────────── */}
      <section id="opinion-publique" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§10 — Module : Opinion publique citoyenne</h2>
          <p className="InfoPage-text">
            Ce module présente les préoccupations déclarées et les positions des Québécois·es sur les
            enjeux d'actualité, telles que mesurées par sondage en ligne quotidien.
          </p>

          <h3 className="Metho-h3">Collecte</h3>
          <p className="InfoPage-text">
            Les données sont issues de l'application <strong>Enju</strong> (anciennement Projet Quorum),
            développée et opérée par la CLESSN. Des sondages sont conduits quotidiennement sur le Web
            auprès d'un panel de Québécois·es volontaires. Chaque question est présentée sur une
            échelle de Likert à cinq points, allant de « Pas du tout d'accord » à « Tout à fait d'accord ».
          </p>

          <h3 className="Metho-h3">Pondération</h3>
          <p className="InfoPage-text">
            Les résultats bruts sont pondérés selon le <strong>genre</strong>, l'<strong>âge</strong> et
            le <strong>niveau d'éducation</strong> des répondants, afin d'assurer une représentativité
            approximative par rapport à la population québécoise telle que décrite par le recensement.
            Un minimum de répondants est requis pour qu'un résultat soit publié.
          </p>

          <h3 className="Metho-h3">Affichage</h3>
          <p className="InfoPage-text">
            Pour chaque enjeu, la Vitrine invite le visiteur à se positionner sur l'échelle et compare
            sa position à la distribution du panel. Un message contextuel indique si la réponse donnée
            correspond à celle de la majorité, d'une minorité significative ou d'une position isolée.
          </p>
        </div>
      </section>

      {/* ── §11 Fenêtres temporelles ─────────────────────────────── */}
      <section id="fenetres-temporelles" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§11 — Fenêtres temporelles et pondérations</h2>
          <p className="InfoPage-text">
            Les modules médias et parlementaires sont disponibles selon trois fenêtres temporelles.
            Dans tous les cas, une pondération décroissante est appliquée : les événements récents
            ont plus de poids que les événements anciens, tout en conservant un contexte historique
            suffisant pour distinguer les tendances des fluctuations ponctuelles.
          </p>

          <div className="Metho-table-wrapper">
            <table className="Metho-table">
              <thead>
                <tr>
                  <th>Fenêtre</th>
                  <th>Portée</th>
                  <th>Pondérations (J, J−1, J−2, J−3, J−4, J−5, J−6)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Jour</strong></td>
                  <td>7 derniers jours</td>
                  <td>1,00 — 0,25 — 0,20 — 0,15 — 0,10 — 0,05 — 0,02</td>
                </tr>
                <tr>
                  <td><strong>Semaine</strong></td>
                  <td>7 derniers jours</td>
                  <td>1,00 — 0,85 — 0,70 — 0,55 — 0,40 — 0,25 — 0,10</td>
                </tr>
                <tr>
                  <td><strong>Mois</strong></td>
                  <td>30 derniers jours</td>
                  <td>Décroissance linéaire de 1,00 à 0,10 sur 30 jours</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="InfoPage-text">
            La fenêtre <em>Jour</em> amplifie fortement le présent (pondération très concentrée sur
            J) et est donc la plus sensible aux événements des dernières 24 heures. La fenêtre{' '}
            <em>Semaine</em> lisse davantage la tendance sur sept jours. La fenêtre <em>Mois</em> offre
            le contexte le plus large, adapté à l'analyse de tendances de fond.
          </p>
        </div>
      </section>

      {/* ── §12 Limites ──────────────────────────────────────────── */}
      <section id="limites" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§12 — Limites reconnues</h2>
          <blockquote className="InfoPage-quote">
            Aucune mesure n'est neutre. La Vitrine revendique sa rigueur en exposant aussi ses limites.
          </blockquote>

          <h3 className="Metho-h3">1. Sélection des sources médiatiques</h3>
          <p className="InfoPage-text">
            Le corpus couvre 13 médias généraux établis. Les médias alternatifs, hyperlocalaux,
            spécialisés (santé, sports, économie), et les plateformes de médias sociaux ne sont pas
            inclus. Ce choix sur-représente les acteurs médiatiques nationaux et les formats
            numériques de presse traditionnelle.
          </p>

          <h3 className="Metho-h3">2. Pages frontales ≠ couverture totale</h3>
          <p className="InfoPage-text">
            Les pages d'accueil ne constituent qu'une fraction de la production journalistique d'un
            média. Certains sujets peuvent faire l'objet d'une couverture approfondie en profondeur
            (reportages, dossiers, chroniques) sans jamais atteindre la une. L'indice de saillance
            mesure la <em>visibilité frontale</em>, pas l'ensemble de la couverture.
          </p>

          <h3 className="Metho-h3">3. Imperfections des modèles d'IA</h3>
          <p className="InfoPage-text">
            Les modèles GLiNER et Gemma 3 peuvent produire des erreurs sur les homonymes (ex. :
            « Ford » peut désigner la marque automobile ou Doug Ford), les entités émergentes et les
            personnalités peu connues hors de leur contexte géographique ou thématique. Des validations
            humaines régulières réduisent ces erreurs, mais ne les éliminent pas.
          </p>

          <h3 className="Metho-h3">4. Limites des dictionnaires de sentiment</h3>
          <p className="InfoPage-text">
            L'approche par dictionnaire ne capte pas l'ironie, le sarcasme, les métaphores ou les
            nuances contextuelles. La valence d'un mot peut varier fortement selon la phrase qui
            l'entoure. Un biais de langue peut aussi apparaître si le dictionnaire est moins complet
            pour une des langues d'analyse.
          </p>

          <h3 className="Metho-h3">5. Comparabilité inter-langues et inter-médias</h3>
          <p className="InfoPage-text">
            Les indices calculés séparément pour les médias francophones et anglophones ne sont pas
            directement comparables en valeur absolue, en raison des différences stylistiques (longueur
            des manchettes, fréquence de renouvellement) entre les deux groupes de sources.
          </p>

          <h3 className="Metho-h3">6. Représentativité du panel de sondage</h3>
          <p className="InfoPage-text">
            Les sondages Enju reposent sur un panel de volontaires recrutés en ligne. Malgré la
            pondération par genre, âge et éducation, des biais de sélection persistent : les personnes
            intéressées par la politique, connectées et alphabétisées numériquement sont sur-représentées.
            Les résultats ne peuvent être interprétés comme représentatifs de l'ensemble de la population
            québécoise au sens statistique strict d'un sondage probabiliste.
          </p>

          <h3 className="Metho-h3">7. Nature statique des données publiées</h3>
          <p className="InfoPage-text">
            Dans la version actuelle de la Vitrine hébergée sur GitHub Pages, les données sont des
            instantanés statiques (<em>snapshots</em>). Elles ne sont pas mises à jour en temps réel,
            mais remplacées manuellement lors de chaque déploiement. Un décalage temporel peut donc
            exister entre la date indiquée dans les visualisations et le moment de la consultation.
          </p>
        </div>
      </section>

      {/* ── §13 Éthique ──────────────────────────────────────────── */}
      <section id="ethique" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§13 — Éthique et transparence</h2>
          <ul className="Metho-bullet-list">
            <li>
              La CLESSN détient les autorisations éthiques requises pour la collecte et le traitement
              des données utilisées dans ce projet, conformément aux politiques de l'Université Laval
              et aux exigences des organismes subventionnaires.
            </li>
            <li>
              Les données sont hébergées au Québec, dans les infrastructures de l'Université Laval.
              Aucune donnée personnelle n'est transmise à des tiers.
            </li>
            <li>
              Aucune donnée permettant d'identifier un individu n'est utilisée dans le calcul des
              indices de saillance médiatique ou parlementaire. Ces indices sont entièrement dérivés
              de contenus publics.
            </li>
            <li>
              Les sondages Enju sont anonymes. Aucune donnée permettant d'identifier un répondant
              n'est conservée dans les tables publiées ou affichées sur la Vitrine.
            </li>
            <li>
              Le code source des raffineurs de données est disponible sur les dépôts GitHub publics de
              la CLESSN (<a href="https://github.com/clessn" target="_blank" rel="noopener noreferrer">github.com/clessn</a>) et
              d'Ellipse Sciences.
            </li>
            <li>
              Le code source de l'interface Vitrine est disponible sur{' '}
              <a href="https://github.com/vitrine-showcase" target="_blank" rel="noopener noreferrer">github.com/vitrine-showcase</a>.
            </li>
          </ul>
        </div>
      </section>

      {/* ── §14 Citation ─────────────────────────────────────────── */}
      <section id="citation" className="InfoPage-section section-outer">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">§14 — Citation et accès aux données</h2>
          <p className="InfoPage-text">
            Si vous utilisez les données, les indices ou les visualisations de la Vitrine Démocratique
            dans vos travaux de recherche ou publications, veuillez utiliser la référence suivante :
          </p>
          <div className="Metho-citation">
            CLESSN (Centre pour l'étude de la citoyenneté, de la démocratie et des inégalités). (2025).{' '}
            <em>Vitrine Démocratique</em> [Plateforme numérique]. Université Laval.{' '}
            <a href="https://vitrine-showcase.github.io" target="_blank" rel="noopener noreferrer">
              https://vitrine-showcase.github.io
            </a>
          </div>
          <p className="InfoPage-text">
            Pour toute demande d'accès aux données brutes ou intermédiaires, ou pour établir une
            collaboration de recherche, contactez-nous via la page{' '}
            <a href="/contact">Contact</a>.
          </p>
        </div>
      </section>

      {/* ── Télécharger ──────────────────────────────────────────── */}
      <section className="InfoPage-section section-outer Metho-download-section">
        <div className="section-inner">
          <h2 className="InfoPage-section-heading has-font-secondary">Documentation complète</h2>
          <p className="InfoPage-text">
            Sauvegardez ou imprimez cette méthodologie en PDF via la fonction d'impression de votre
            navigateur (Fichier → Imprimer → Enregistrer au format PDF).
          </p>
          <button type="button" className="Button" onClick={handlePrint}>
            Télécharger la méthodologie (PDF)
          </button>
        </div>
      </section>

    </InfoPage>
  );
};

export default memo(MethodologyPage);
