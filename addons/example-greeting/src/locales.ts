/**
 * Localized catalogs for the greeting addon's user-facing output.
 * `en-US` is the base; other locales fall back to it, then to the key.
 */
export const locales = {
  'en-US': { footerGreetedBy: 'Greeted by {tag}', footerMemberCount: 'Member #{count}', theServer: 'the server' },
  de: { footerGreetedBy: 'Begrüßt von {tag}', footerMemberCount: 'Mitglied #{count}', theServer: 'den Server' },
  'es-ES': { footerGreetedBy: 'Saludado por {tag}', footerMemberCount: 'Miembro n.º {count}', theServer: 'el servidor' },
  fr: { footerGreetedBy: 'Salué par {tag}', footerMemberCount: 'Membre n° {count}', theServer: 'le serveur' },
  it: { footerGreetedBy: 'Salutato da {tag}', footerMemberCount: 'Membro n. {count}', theServer: 'il server' },
  ja: { footerGreetedBy: '{tag} さんが挨拶しました', footerMemberCount: 'メンバー #{count}', theServer: 'サーバー' },
  ko: { footerGreetedBy: '{tag} 님이 인사함', footerMemberCount: '멤버 #{count}', theServer: '서버' },
  pl: { footerGreetedBy: 'Przywitany przez {tag}', footerMemberCount: 'Członek #{count}', theServer: 'serwer' },
  'pt-BR': { footerGreetedBy: 'Cumprimentado por {tag}', footerMemberCount: 'Membro #{count}', theServer: 'o servidor' },
  ru: { footerGreetedBy: 'Поприветствовал(а) {tag}', footerMemberCount: 'Участник №{count}', theServer: 'сервер' },
  'zh-CN': { footerGreetedBy: '由 {tag} 问候', footerMemberCount: '第 {count} 位成员', theServer: '服务器' },
};
