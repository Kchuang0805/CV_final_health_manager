/// <reference types="vite/client" />

declare interface ImportMetaEnv {
    readonly VITE_LINE_BOT_API?: string;
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv;
}
