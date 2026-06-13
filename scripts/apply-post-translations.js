#!/usr/bin/env node

/**
 * Apply post content translations to generate language-specific posts.json files.
 *
 * Reads data/posts.json (Chinese source of truth) and data/post-translations.json,
 * then writes data/posts_en.json and data/posts_sv.json where each post's content
 * is replaced by the translated version when available.
 */

const fs = require('fs');
const path = require('path');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const TRANSLATIONS_PATH = path.join(__dirname, '..', 'data', 'post-translations.json');
const OUT_EN = path.join(__dirname, '..', 'data', 'posts_en.json');
const OUT_SV = path.join(__dirname, '..', 'data', 'posts_sv.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function applyTranslations() {
  const postsData = readJson(POSTS_PATH);
  const translations = readJson(TRANSLATIONS_PATH);

  const enData = JSON.parse(JSON.stringify(postsData));
  const svData = JSON.parse(JSON.stringify(postsData));

  for (let i = 0; i < postsData.posts.length; i++) {
    const original = postsData.posts[i].content;
    if (!original) continue;

    const trans = translations[original];
    if (trans) {
      enData.posts[i].content = trans.en;
      svData.posts[i].content = trans.sv;
    }
  }

  writeJson(OUT_EN, enData);
  writeJson(OUT_SV, svData);

  console.log(`✅ Generated ${OUT_EN}`);
  console.log(`✅ Generated ${OUT_SV}`);
}

applyTranslations();
