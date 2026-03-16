import { Menu, Tray, app, nativeImage } from "electron";

export function createDesktopTray(options: {
    model?: string;
    onQuit(): void;
    onToggle(): void;
}): Tray {
    const tray = new Tray(createTrayIcon());
    tray.setToolTip("Byte");
    tray.setContextMenu(buildTrayMenu(options));
    tray.on("click", options.onToggle);
    return tray;
}

export function buildTrayMenu(options: {
    model?: string;
    onQuit(): void;
    onToggle(): void;
}): Menu {
    return Menu.buildFromTemplate([
        {
            label: "Show / Hide Byte",
            click: options.onToggle,
        },
        {
            label: options.model ? `Model: ${options.model}` : "Model: not selected",
            enabled: false,
        },
        { type: "separator" },
        {
            label: "Quit",
            click: options.onQuit,
            accelerator: app.isPackaged ? undefined : "CommandOrControl+Q",
        },
    ]);
}

function createTrayIcon() {
    const icon = nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAALFJREFUOI3NkrENwjAQRd9LJQ2slDV0AJM0dAAbNHR0AA0dQAfQ0QG0dAAxM3SCIK2puHb0JwT5Y3/zX+fP7jw2wD6Wx6mM8T2tJmQbAOTfWnSQdOwd0m2yRknD72BiY0PqfEhjT8gF2pLtq3F6J6zrBhOofb5fPqJynh6ACyTgnM2G1ZbY2rVnROQm1E2T3+8m1TF6h3BJEZ6fXcGQJ1Jr9S+G5hd8QqX5g0m2x+AC31tD4jZ5nQAAAAASUVORK5CYII=",
    );
    icon.setTemplateImage(true);
    return icon;
}
