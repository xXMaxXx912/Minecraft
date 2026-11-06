// Gespeicherte Gespräche, je Konto. Speicherung als JSON-Datei.
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.js";

export const MAX_CHATS_PER_USER = 100;
export const MAX_MESSAGES_PER_CHAT = 1000;

export class ChatStore {
  constructor(file) {
    this.file = file;
    this.chats = readJson(file, []);
  }

  save() {
    writeJson(this.file, this.chats);
  }

  listFor(ownerId) {
    return this.chats
      .filter((c) => c.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(ownerId, id) {
    return this.chats.find((c) => c.id === id && c.ownerId === ownerId) || null;
  }

  create(ownerId, character) {
    if (this.listFor(ownerId).length >= MAX_CHATS_PER_USER) return null;
    const now = new Date().toISOString();
    const chat = {
      id: crypto.randomUUID(),
      ownerId,
      characterId: character.id,
      title: "Neues Gespräch",
      messages: [{ role: "assistant", content: character.greeting }],
      createdAt: now,
      updatedAt: now,
    };
    this.chats.push(chat);
    this.save();
    return chat;
  }

  append(chat, ...messages) {
    chat.messages.push(...messages);
    if (chat.messages.length > MAX_MESSAGES_PER_CHAT) {
      chat.messages = chat.messages.slice(-MAX_MESSAGES_PER_CHAT);
    }
    if (chat.title === "Neues Gespräch") {
      const first = chat.messages.find((m) => m.role === "user");
      if (first) chat.title = first.content.replace(/\s+/g, " ").slice(0, 40) + (first.content.length > 40 ? "…" : "");
    }
    chat.updatedAt = new Date().toISOString();
    this.save();
  }

  // Nimmt eine Nachricht wieder heraus (z. B. wenn der KI-Anbieter einen Fehler liefert).
  removeMessage(chat, message) {
    chat.messages = chat.messages.filter((m) => m !== message);
    if (!chat.messages.some((m) => m.role === "user")) chat.title = "Neues Gespräch";
    this.save();
  }

  remove(ownerId, id) {
    const before = this.chats.length;
    this.chats = this.chats.filter((c) => !(c.id === id && c.ownerId === ownerId));
    if (this.chats.length === before) return false;
    this.save();
    return true;
  }

  removeWhere(predicate) {
    const before = this.chats.length;
    this.chats = this.chats.filter((c) => !predicate(c));
    if (this.chats.length !== before) this.save();
  }
}
