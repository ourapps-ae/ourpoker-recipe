package app.ourapps.ourpoker

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.ourapps.ourpoker.net.View
import app.ourapps.ourpoker.net.json
import app.ourapps.ourpoker.ui.text
import app.ourapps.ourpoker.ui.HelpScreen
import app.ourapps.ourpoker.ui.TableScreen
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FixtureScreenTest {
    @get:Rule val compose = createComposeRule()
    private val models = ViewModelStore()
    private lateinit var application: Application

    @Before
    fun requireFreshVerificationApplication() {
        assertEquals("true", InstrumentationRegistry.getArguments().getString("recipeVerification"))
        application = ApplicationProvider.getApplicationContext()
        check(!application.getSharedPreferences("ourpoker", 0).contains("token"))
    }

    @After
    fun releaseMediaAndModels() {
        compose.runOnIdle { models.clear() }
    }

    @Test
    fun packagedResponsesDecodeAndRenderTheGameWithWorkingHelpControls() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val names = assets.list("").orEmpty().filter { it.endsWith(".json") }
        check(names.isNotEmpty())
        for (name in names) assets.open(name).bufferedReader().use {
            assertNotNull(json.decodeFromString(View.serializer(), it.readText()))
        }
        val view = assets.open("betting.json").bufferedReader().use {
            json.decodeFromString(View.serializer(), it.readText())
        }
        compose.setContent {
            val model = ViewModelProvider(models, ViewModelProvider.AndroidViewModelFactory(application))[TableViewModel::class.java]
            val state by model.state.collectAsState()
            MaterialTheme(colorScheme = PokerColors) {
                if (state.help) HelpScreen { model.showHelp(false) }
                else TableScreen(model, UiState(view = view, viewAt = System.currentTimeMillis()), view)
            }
        }
        compose.onNodeWithText(application.text(if (view.roomId == "casino") "room_casino" else "room_home")).assertIsDisplayed()
        compose.onNodeWithContentDescription(application.text("how_to_play")).performClick()
        compose.onNodeWithText(application.text("how_to_play")).assertIsDisplayed()
        compose.onNodeWithContentDescription(application.text("done")).performClick()
        compose.onNodeWithContentDescription(application.text("how_to_play")).assertIsDisplayed()
    }
}
