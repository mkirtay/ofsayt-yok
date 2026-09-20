/**
 * Gündem resmi/bot hesabı. Tek bir "Ofsayt Yok" User satırı (password: null → giriş yapılamaz).
 * E-posta `.invalid` alan adında: gerçek bir posta kutusu olmadığından şifre sıfırlama ile ele geçirilemez.
 * Satır `scripts/seed-official-account.mjs` ile oluşturulur.
 */
export const OFFICIAL_ACCOUNT_EMAIL = 'official@ofsaytyok.invalid';
export const OFFICIAL_ACCOUNT_USERNAME = 'ofsaytyok';
export const OFFICIAL_ACCOUNT_NAME = 'Ofsayt Yok';
