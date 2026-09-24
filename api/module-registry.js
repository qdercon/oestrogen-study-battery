// A module is a collection of tasks to be completed in a single sitting.
// Each module can contain one or more tasks, and each task can have its own configuration settings.

export const ModuleRegistryPILTWM = {
    oestrogen_battery: {
        name: "Oestrogen study battery",
        moduleConfig: { // Settings that apply to all tasks in the module unless overridden
            session: "wk0",
            sequence: "wk0"
        }, 
        elements: [
            { type: "instructions", config: { text: "start_message" } },
            { type: "task", name: "PILT" },
            { type: "task", name: "WM" },
            { type: "instructions", config: { text: "break_message" } },
            { type: "task", name: "post_PILT_test"},
            { type: "task", name: "post_WM_test"},
            { type: "bonus" },
        ],
        max_bonus: 5.0,
        min_prop_bonus: 0.6
    }
};
