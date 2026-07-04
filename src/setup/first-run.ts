/**
 * Interactive first-run setup
 */

import { BonsaiManager } from './manager.js';
import type { BonsaiModel } from './models.js';
import {
  showWelcomeBanner,
  showHardwareInfo,
  showRecommendedModel,
  showModelSelectionMenu,
  askYesNo,
  askNumber,
  showServerStarting,
  showServerReady,
  showSetupComplete,
  showLowRAMWarning,
  showError,
} from './ui.js';
import { getN0xHome } from '../config.js';
import { configPath, writeDefaultConfig } from '../config.js';
import { rm, writeFile } from 'node:fs/promises';
import chalk from 'chalk';

async function writeBonsaiModelConfig(selectedModel: BonsaiModel, modelPath: string): Promise<void> {
  await writeDefaultConfig();
  const tomlContent = `# n0x configuration
default_provider = "local"
default_model = "${selectedModel.id}"
base_url = "http://localhost:8080/v1"
api_key = "none"
max_steps = 20
git_context = true
stream_output = true
sandbox_docker = false
bash_timeout_ms = 120000
llm_timeout_ms = 300000
tavily_enabled = false
tavily_search_depth = "basic"
tavily_extract_depth = "basic"

# Bonsai model path
model_path = "${modelPath}"
backend = "llama-cpp"
`;

  await writeFile(configPath(), tomlContent, 'utf8');
}

export async function firstRunSetup(): Promise<void> {
  try {
    showWelcomeBanner();

    const manager = new BonsaiManager(getN0xHome());
    await manager.init();

    // Detect hardware
    const ramInfo = manager.getRAMInfo();
    showHardwareInfo(ramInfo);

    // Show recommended model
    const recommended = manager.recommendModel();
    showRecommendedModel(recommended);

    // Show warning if low RAM
    showLowRAMWarning(ramInfo);

    // Ask if user wants recommended model
    const useRecommended = await askYesNo(
      `Download ${recommended.displayName}?`,
      true,
    );

    let selectedModel = recommended;

    if (!useRecommended) {
      // Show all models
      const allModels = manager.getAllModels();
      showModelSelectionMenu(allModels, recommended);

      const choice = await askNumber(
        'Select model',
        1,
        allModels.length,
        allModels.indexOf(recommended) + 1,
      );

      selectedModel = allModels[choice - 1]!;
      console.log();
    }

    // Download model
    console.log(chalk.cyan(`Selected: ${selectedModel.displayName}\n`));
    const modelPath = await manager.downloadModel(selectedModel);

    // Save configuration before server validation so doctor can still inspect it.
    await writeBonsaiModelConfig(selectedModel, modelPath);

    // Start server
    showServerStarting(selectedModel.displayName, 8080);
    await manager.startServer(modelPath, 8080);
    showServerReady('http://localhost:8080', selectedModel.ramMB);

    // Done!
    showSetupComplete();
  } catch (error) {
    if (error instanceof Error) {
      showError(
        'Setup Failed',
        error.message,
        [
          'Check your internet connection',
          'If llama-server failed, install llama.cpp so llama-server is on PATH',
          'Try running: n0x setup',
          'Report issue: https://github.com/ixchio/n0x-cli/issues',
        ],
      );
    }
    process.exit(1);
  }
}

/**
 * Interactive model selection menu (for n0x setup command)
 */
export async function interactiveModelSetup(): Promise<void> {
  showWelcomeBanner();

  const manager = new BonsaiManager(getN0xHome());
  await manager.init();

  const ramInfo = manager.getRAMInfo();
  showHardwareInfo(ramInfo);

  const recommended = manager.recommendModel();
  const allModels = manager.getAllModels();

  showModelSelectionMenu(allModels, recommended);

  const choice = await askNumber(
    'Select model',
    1,
    allModels.length,
    allModels.indexOf(recommended) + 1,
  );

  const selectedModel = allModels[choice - 1]!;
  console.log();

  console.log(chalk.cyan(`Selected: ${selectedModel.displayName}\n`));

  let modelPath: string | null = null;

  // Check if already downloaded
  if (await manager.hasModel(selectedModel.id)) {
    console.log(chalk.green('✓ Model already downloaded\n'));

    const redownload = await askYesNo('Re-download?', false);
    if (!redownload) {
      console.log(chalk.yellow('Skipped download.\n'));
      modelPath = manager.getModelPath(selectedModel.id);
    } else {
      const existingPath = manager.getModelPath(selectedModel.id);
      if (existingPath) await rm(existingPath, { force: true });
    }
  }

  // Download
  modelPath ??= await manager.downloadModel(selectedModel);
  if (!modelPath) {
    throw new Error(`Could not locate ${selectedModel.displayName} after setup`);
  }

  // Update config
  await writeBonsaiModelConfig(selectedModel, modelPath);

  console.log(chalk.green('✓ Configuration updated\n'));

  try {
    const serverPath = await manager.ensureLlamaServer();
    console.log(chalk.green('✓ llama-server ready'));
    console.log(chalk.dim(`  ${serverPath}\n`));
  } catch (error) {
    showError(
      'llama-server not ready',
      error instanceof Error ? error.message : String(error),
      manager.getLlamaServerInstallHints(),
    );
    process.exit(1);
  }

  console.log(chalk.bold('Model ready! Start coding:'));
  console.log(chalk.cyan('  n0x run "your task here"\n'));
}
