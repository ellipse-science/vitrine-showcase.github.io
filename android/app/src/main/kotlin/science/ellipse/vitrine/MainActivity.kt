package science.ellipse.vitrine

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.os.Message
import android.widget.Button
import android.widget.LinearLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Coquille de l'application : le site, plein cadre, sans chrome de navigateur.
 * Volontairement la même chose que la version « ajoutée à l'écran d'accueil »
 * depuis Chrome, avec ce que le web ne peut pas faire.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var vueWeb: WebView
    private lateinit var tirer: SwipeRefreshLayout
    private lateinit var horsLigne: LinearLayout

    private val veilleur = VeilleurEdition()
    private var erreurPage = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(etat: Bundle?) {
        super.onCreate(etat)
        setContentView(R.layout.activity_main)

        vueWeb = findViewById(R.id.vue_web)
        tirer = findViewById(R.id.tirer_pour_actualiser)
        horsLigne = findViewById(R.id.hors_ligne)

        findViewById<Button>(R.id.reessayer).setOnClickListener { recharger() }
        tirer.setOnRefreshListener { recharger() }

        vueWeb.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // `target="_blank"` demande une nouvelle fenêtre. Sans ces deux
            // réglages ET onCreateWindow ci-dessous, le clic ne fait
            // STRICTEMENT RIEN : ni erreur, ni navigation.
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
        }

        vueWeb.webViewClient = Aiguilleur()
        vueWeb.webChromeClient = OuvreurDeFenetre()

        // Bouton retour du système : sans cela, il quitte l'application depuis
        // n'importe quelle sous-page. C'est le réflexe le plus ancré d'Android.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (vueWeb.canGoBack()) vueWeb.goBack() else finish()
            }
        })

        if (etat != null) vueWeb.restoreState(etat) else vueWeb.loadUrl(Vitrine.SITE)
    }

    override fun onSaveInstanceState(etat: Bundle) {
        super.onSaveInstanceState(etat)
        vueWeb.saveState(etat)
    }

    /**
     * Retour au premier plan. Les données du site sont inlinées dans le HTML au
     * build : une page gardée en mémoire est une édition figée. Même sonde que
     * `ActualisationAuto` côté web.
     */
    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            val neuve = withContext(Dispatchers.IO) { veilleur.editionPlusRecente() }
            if (neuve && !erreurPage) vueWeb.reload()
        }
    }

    private fun recharger() {
        erreurPage = false
        horsLigne.visibility = View.GONE
        vueWeb.visibility = View.VISIBLE
        vueWeb.loadUrl(Vitrine.SITE)
    }

    private fun ouvrirAilleurs(url: String) {
        if (Vitrine.estSchemaWeb(url)) {
            // Onglet Chrome : l'équivalent d'SFSafariViewController. Le lien
            // garde ses témoins et son bouton de partage, sans quitter
            // l'application.
            runCatching {
                CustomTabsIntent.Builder().setShowTitle(true).build()
                    .launchUrl(this, Uri.parse(url))
            }.onFailure {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        } else {
            // mailto:, tel:, intent: — la vue web ne sait pas les traiter.
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        }
    }

    private inner class Aiguilleur : WebViewClient() {
        override fun shouldOverrideUrlLoading(vue: WebView, requete: WebResourceRequest): Boolean {
            val url = requete.url?.toString() ?: return false
            if (Vitrine.estInterne(url)) return false
            ouvrirAilleurs(url)
            return true
        }

        override fun onPageStarted(vue: WebView, url: String?, favicon: Bitmap?) {
            erreurPage = false
        }

        override fun onPageFinished(vue: WebView, url: String?) {
            tirer.isRefreshing = false
            if (!erreurPage) {
                horsLigne.visibility = View.GONE
                vueWeb.visibility = View.VISIBLE
            }
        }

        override fun onReceivedError(
            vue: WebView,
            requete: WebResourceRequest,
            erreur: WebResourceError,
        ) {
            // Seul l'échec de la page principale compte : une image ou une
            // police manquante ne doit pas masquer un article lisible.
            if (!requete.isForMainFrame) return
            erreurPage = true
            tirer.isRefreshing = false
            vueWeb.visibility = View.GONE
            horsLigne.visibility = View.VISIBLE
        }
    }

    /** `target="_blank"` : le site en pose 21. */
    private inner class OuvreurDeFenetre : WebChromeClient() {
        override fun onCreateWindow(
            vue: WebView,
            estBoiteDeDialogue: Boolean,
            estGesteUtilisateur: Boolean,
            message: Message,
        ): Boolean {
            // L'URL visée n'est pas encore connue ici : on la récupère en
            // laissant une vue jetable recevoir la requête, puis on l'ouvre
            // ailleurs. C'est le procédé usuel pour `target="_blank"`.
            val sonde = WebView(vue.context)
            sonde.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    v: WebView,
                    requete: WebResourceRequest,
                ): Boolean {
                    requete.url?.toString()?.let { ouvrirAilleurs(it) }
                    sonde.destroy()
                    return true
                }
            }
            (message.obj as? WebView.WebViewTransport)?.webView = sonde
            message.sendToTarget()
            return true
        }
    }
}
