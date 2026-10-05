# Card-Choosing Task

## Overview
The card-choosing task is a behavioral paradigm that implements both Pavlovian-Instrumental Learning Task (PILT) and Reinforcement Learning Working Memory (RLWM) task variants. Participants learn to choose between visual stimuli (cards) to maximize rewards, with different task configurations supporting various experimental designs.

## File Structure

### Core Files

#### `index.js`
**Purpose**: Main entry point that centralizes all exports from the task module.
- Re-exports all functions from `utils.js`, `instructions.js`, and `timeline.js`
- Provides a single import point for accessing card-choosing task functionality

#### `timeline.js`
**Purpose**: Contains the main timeline creation functions and task orchestration logic.

**Main Export Functions**:
- **`createCardChoosingTimeline(settings)`**: Creates the complete timeline for the main learning phase
  - Handles both PILT and WM task variants
  - Manages asset preloading, instructions, and task blocks
  - Applies resumption rules if enabled
  - Returns array of jsPsych trial objects
  
- **`createPostLearningTestTimeline(settings)`**: Creates timeline for post-learning test phase
  - Builds test trials with adjusted stimulus paths
  - Handles both PILT and WM test variants
  - Includes pavlovian test integration for PILT
  - Returns array of jsPsych trial objects for testing
  
- **`computeRelativeCardChoosingBonus()`**: Calculates the performance tally used for the final points score
  - Computes earned vs. theoretical min/max possible scores
  - Returns object with `{earned, min, max}` values

#### `utils.js`
**Purpose**: Utility functions for task construction, trial building, and asset management.

**Main Export Functions**:
- **`preloadAssets(settings)`**: Generates list of image assets to preload based on task settings
- **`buildCardChoosingTask(structure, learning, settings)`**: Constructs the main task blocks from JSON structure
- **`buildPostLearningTest(test_structure, task_name, settings)`**: Creates test phase trials
- **`adjustStimuliPaths(structure, base_path)`**: Updates stimulus file paths in trial structures
- **`cardChoosingTrial(trial_info, learning, settings)`**: Creates individual card-choosing trial objects
- **`testTrial(trial_info, task_name, settings)`**: Creates individual test trial objects
- **`getPavlovianImages(session)`**: Retrieves pavlovian stimulus images for given session
- **`interBlockStimulus(settings)`**: Generates inter-block instruction content
- **`interBlockMsg(settings)`**: Creates block progress messages

#### `instructions.js`
**Purpose**: Manages all instruction sequences, practice trials, and comprehension checks.

**Main Export Functions**:
- **`preparePILTInstructions(settings)`**: Creates complete PILT instruction sequence
  - Includes tutorial pages, practice trials, and comprehension quiz
  - Adapts content based on task settings (n_choices, valence, etc.)
  
- **`testInstructions(task_name)`**: Generates instructions for test phase
  - Task-specific instructions for PILT vs WM testing
  
- **`WM_instructions`**: Static instruction sequence for Working Memory task variant

#### `plugin-card-choosing.js`
**Purpose**: Custom jsPsych plugin that implements the core card-choosing trial logic.
- Handles stimulus presentation and response collection
- Manages timing, feedback display, and data recording
- Supports 1-3 stimulus configurations
- Integrates pavlovian stimulus presentation
- Version 1.11 with multi-stimulus support

#### `styles.css`
**Purpose**: CSS styling for the card-choosing task interface.
- Defines layout for stimulus presentation boxes
- Handles responsive design for different screen sizes
- Styles for feedback display, borders, and animations
- Ensures consistent visual presentation across trials

## Task Variants

### PILT (Pavlovian-Instrumental Learning Task)
- Combines instrumental learning with pavlovian conditioning
- Participants learn stimulus-outcome associations through choice
- Includes pavlovian stimuli that predict outcomes without choice required
- Post-learning test measures transfer of pavlovian influences

### WM (Working Memory)
- Tests working memory capacity alongside instrumental learning
- Modified trial structure with memory load components
- Separate instruction and test sequences optimized for WM assessment

## Usage Example

```javascript
import { createCardChoosingTimeline, createPostLearningTestTimeline } from './tasks/card-choosing/index.js';

// Create main learning timeline
const settings = {
  task_name: "pilt",
  n_choices: 2,
  valence: "mixed",
  session: "wk0"
};

const learningTimeline = createCardChoosingTimeline(settings);

// Create test timeline
const testTimeline = createPostLearningTestTimeline(settings);
```

## Dependencies
- Core utilities from `/core/utils/index.js`
- jsPsych framework and plugins
- JSON sequence files (PILT_json, WM_json, etc.)
- Asset images in `/assets/images/card-choosing/` and `/assets/images/pavlovian-stims/`

## Data Output
The task records detailed trial-by-trial data including:
- Stimulus presentations and participant choices
- Response times and feedback received
- Block and trial numbers for analysis
- Pavlovian stimulus exposure tracking
- Performance metrics for the points calculation
