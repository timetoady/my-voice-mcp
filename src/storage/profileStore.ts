import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { NotFoundError } from "../domain/errors.js";
import type { ProfileIndexEntry, VoiceProfile } from "../domain/types.js";

export interface StoredAssets {
  profile: VoiceProfile;
  guideMarkdown: string;
  extractedText: string;
}

interface ProfileIndex {
  profiles: ProfileIndexEntry[];
}

interface StoredFile {
  relativePath: string;
  content: string;
}

export class ProfileStore {
  private readonly indexPath: string;

  constructor(private readonly dataDir: string) {
    this.indexPath = path.join(this.dataDir, "index.json");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      await readFile(this.indexPath, "utf8");
    } catch {
      await this.writeIndex({ profiles: [] });
    }
  }

  async listProfiles(): Promise<ProfileIndexEntry[]> {
    const index = await this.readIndex();
    return index.profiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getProfile(voiceId: string): Promise<VoiceProfile> {
    const profilePath = path.join(this.profileDir(voiceId), "guide.json");
    try {
      const raw = await readFile(profilePath, "utf8");
      return JSON.parse(raw) as VoiceProfile;
    } catch {
      throw new NotFoundError(`Voice profile '${voiceId}' was not found.`);
    }
  }

  async getProfileAssets(voiceId: string): Promise<StoredAssets> {
    const dir = this.profileDir(voiceId);
    try {
      const [profile, guideMarkdown, extractedText] = await Promise.all([
        readFile(path.join(dir, "guide.json"), "utf8"),
        readFile(path.join(dir, "guide.md"), "utf8"),
        readFile(path.join(dir, "extracted.txt"), "utf8")
      ]);

      return {
        profile: JSON.parse(profile) as VoiceProfile,
        guideMarkdown,
        extractedText
      };
    } catch {
      throw new NotFoundError(`Voice profile '${voiceId}' was not found.`);
    }
  }

  async saveProfile(params: {
    voiceId: string;
    profile: VoiceProfile;
    guideMarkdown: string;
    extractedText: string;
    sourceFile?: {
      sourcePath: string;
      destinationName: string;
    };
    files?: StoredFile[];
  }): Promise<void> {
    const dir = this.profileDir(params.voiceId);
    await mkdir(dir, { recursive: true });

    const writeTasks: Array<Promise<unknown>> = [
      writeFile(path.join(dir, "guide.json"), JSON.stringify(params.profile, null, 2), "utf8"),
      writeFile(path.join(dir, "guide.md"), params.guideMarkdown, "utf8"),
      writeFile(path.join(dir, "extracted.txt"), params.extractedText, "utf8")
    ];

    if (params.sourceFile) {
      writeTasks.push(copyFile(params.sourceFile.sourcePath, path.join(dir, params.sourceFile.destinationName)));
    }

    for (const file of params.files ?? []) {
      const targetPath = path.join(dir, file.relativePath);
      writeTasks.push(
        mkdir(path.dirname(targetPath), { recursive: true }).then(() => writeFile(targetPath, file.content, "utf8"))
      );
    }

    await Promise.all(writeTasks);

    const index = await this.readIndex();
    const entry: ProfileIndexEntry = {
      voiceId: params.profile.voiceId,
      voiceName: params.profile.voiceName,
      profileType: params.profile.profileType,
      description: params.profile.description,
      createdAt: params.profile.createdAt,
      summary: params.profile.summary,
      sourceStats: params.profile.sourceStats,
      warnings: params.profile.warnings
    };

    const remaining = index.profiles.filter((profile) => profile.voiceId !== params.voiceId);
    remaining.push(entry);
    await this.writeIndex({ profiles: remaining });
  }

  async deleteProfile(voiceId: string): Promise<void> {
    await rm(this.profileDir(voiceId), { recursive: true, force: true });
    const index = await this.readIndex();
    await this.writeIndex({ profiles: index.profiles.filter((profile) => profile.voiceId !== voiceId) });
  }

  private profileDir(voiceId: string): string {
    return path.join(this.dataDir, voiceId);
  }

  private async readIndex(): Promise<ProfileIndex> {
    await this.ensureReady();
    const raw = await readFile(this.indexPath, "utf8");
    return JSON.parse(raw) as ProfileIndex;
  }

  private async writeIndex(index: ProfileIndex): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }
}
