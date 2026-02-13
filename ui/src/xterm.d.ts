declare module '@xterm/xterm' {
  export class Terminal {
    constructor(options?: any);
    onData(callback: (data: string) => void): any;
    onResize(callback: (size: { cols: number; rows: number }) => void): any;
    open(element: HTMLElement): void;
    write(data: string | Uint8Array): void;
    writeln(data: string): void;
    clear(): void;
    reset(): void;
    dispose(): void;
    loadAddon(addon: any): void;
    focus(): void;
    paste(data: string): void;
    onKey(callback: (event: { key: string; domEvent: KeyboardEvent }) => void): any;
    cols: number;
    rows: number;
    options: any;
    element: HTMLElement | undefined;
  }
}

declare module '@xterm/addon-fit' {
  export class FitAddon {
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
    activate(terminal: any): void;
    dispose(): void;
  }
}

declare module '@xterm/addon-web-links' {
  export class WebLinksAddon {
    constructor(handler?: (event: MouseEvent, uri: string) => void, options?: any);
    activate(terminal: any): void;
    dispose(): void;
  }
}
