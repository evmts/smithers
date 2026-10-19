/** Review a curated view; retain and hash the complete source in the artifact. */
import { type Evidence } from "./schema.ts";
export declare const visibleLine: (evidence: Evidence, path: string, line: number) => boolean;
export declare const reviewEvidence: (evidence: Evidence) => {
    spec: {
        id: string;
        title: string;
        purpose: string;
        kind: "current" | "intent";
        document: string;
    };
    sections: readonly {
        readonly id: string;
        readonly markdown: string;
    }[];
    sources: {
        path: string;
        complete: boolean;
        lines: string;
    }[];
};
