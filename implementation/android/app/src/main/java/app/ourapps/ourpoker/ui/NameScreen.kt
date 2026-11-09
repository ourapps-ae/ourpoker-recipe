package app.ourapps.ourpoker.ui

import ae.controls.Panel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.UiState

// First run, and "Change name" later: the display name kept on this phone.
@Composable
fun NameScreen(vm: TableViewModel, ui: UiState) {
    var name by rememberSaveable { mutableStateOf(ui.name) }
    Box(Modifier.fillMaxSize()) {
        PokerBackground()
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Logo(60.dp)
            Spacer(Modifier.height(12.dp))
            Text(L("app_name"), style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(24.dp))
            Panel(title = L(if (ui.name.isEmpty()) "first_run_title" else "change_name")) {
                Text(L("first_run_body"), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name, onValueChange = { name = it.take(20) }, label = { Text(L("your_name")) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    if (ui.name.isNotEmpty()) TextButton(onClick = { vm.editName(false) }) { Text(L("cancel")) }
                    Button(onClick = { vm.setName(name) }, enabled = name.trim().isNotEmpty()) { Text(L("save")) }
                }
            }
        }
    }
}
