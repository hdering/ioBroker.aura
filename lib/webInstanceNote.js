'use strict';

/**
 * The note under "Web instance" in the instance settings (#997): which web
 * instances other Aura instances already use, and why they cannot be chosen
 * here. Answered for the admin's `textSendTo` (`{ text, style }`), in the
 * system language.
 */

const TEXTS = {
    en: {
        taken: (list) => `Cannot be chosen here: ${list}.`,
        why: 'A web instance serves one Aura instance under /aura/. For this instance add another web instance (e.g. web.1 on its own port), or leave the field empty - then Aura opens its own port.',
        chosen: (web, other) =>
            `${web} is already used by ${other}: this instance would not be reached there. Choose another web instance.`,
    },
    de: {
        taken: (list) => `Hier nicht wählbar: ${list}.`,
        why: 'Eine Web-Instanz liefert genau eine Aura-Instanz unter /aura/ aus. Für diese Instanz eine weitere Web-Instanz anlegen (z. B. web.1 auf eigenem Port) oder das Feld leer lassen – dann öffnet Aura einen eigenen Port.',
        chosen: (web, other) =>
            `${web} nutzt bereits ${other}: Diese Instanz wäre dort nicht erreichbar. Bitte eine andere Web-Instanz wählen.`,
    },
    ru: {
        taken: (list) => `Здесь нельзя выбрать: ${list}.`,
        why: 'Веб-экземпляр обслуживает только один экземпляр Aura под /aura/. Для этого экземпляра добавьте ещё один веб-экземпляр (например, web.1 на своём порту) или оставьте поле пустым — тогда Aura откроет собственный порт.',
        chosen: (web, other) =>
            `${web} уже использует ${other}: этот экземпляр там будет недоступен. Выберите другой веб-экземпляр.`,
    },
    pt: {
        taken: (list) => `Não pode ser escolhida aqui: ${list}.`,
        why: 'Uma instância web serve apenas uma instância do Aura em /aura/. Para esta instância adicione outra instância web (ex. web.1 na sua própria porta) ou deixe o campo vazio - então o Aura abre uma porta própria.',
        chosen: (web, other) =>
            `${web} já é usada por ${other}: esta instância não seria acessível aí. Escolha outra instância web.`,
    },
    nl: {
        taken: (list) => `Hier niet te kiezen: ${list}.`,
        why: 'Een webinstantie bedient precies één Aura-instantie onder /aura/. Voeg voor deze instantie een extra webinstantie toe (bijv. web.1 op een eigen poort) of laat het veld leeg - dan opent Aura een eigen poort.',
        chosen: (web, other) =>
            `${web} wordt al gebruikt door ${other}: deze instantie zou daar niet bereikbaar zijn. Kies een andere webinstantie.`,
    },
    fr: {
        taken: (list) => `Impossible à choisir ici : ${list}.`,
        why: "Une instance web ne sert qu'une seule instance Aura sous /aura/. Pour cette instance, ajoutez une autre instance web (p. ex. web.1 sur son propre port) ou laissez le champ vide - Aura ouvre alors son propre port.",
        chosen: (web, other) =>
            `${web} est déjà utilisée par ${other} : cette instance n'y serait pas accessible. Choisissez une autre instance web.`,
    },
    it: {
        taken: (list) => `Non selezionabile qui: ${list}.`,
        why: "Un'istanza web serve una sola istanza Aura sotto /aura/. Per questa istanza aggiungere un'altra istanza web (es. web.1 su una porta propria) o lasciare il campo vuoto - allora Aura apre una porta propria.",
        chosen: (web, other) =>
            `${web} è già usata da ${other}: questa istanza lì non sarebbe raggiungibile. Scegliere un'altra istanza web.`,
    },
    es: {
        taken: (list) => `No se puede elegir aquí: ${list}.`,
        why: 'Una instancia web sirve una sola instancia de Aura bajo /aura/. Para esta instancia añada otra instancia web (p. ej. web.1 en su propio puerto) o deje el campo vacío: entonces Aura abre un puerto propio.',
        chosen: (web, other) =>
            `${web} ya la usa ${other}: esta instancia no sería accesible allí. Elija otra instancia web.`,
    },
    pl: {
        taken: (list) => `Nie można tu wybrać: ${list}.`,
        why: 'Instancja web obsługuje dokładnie jedną instancję Aura pod /aura/. Dla tej instancji dodaj kolejną instancję web (np. web.1 na własnym porcie) albo zostaw pole puste - wtedy Aura otworzy własny port.',
        chosen: (web, other) =>
            `${web} jest już używana przez ${other}: ta instancja nie byłaby tam osiągalna. Wybierz inną instancję web.`,
    },
    uk: {
        taken: (list) => `Тут не можна вибрати: ${list}.`,
        why: 'Веб-екземпляр обслуговує лише один екземпляр Aura під /aura/. Для цього екземпляра додайте ще один веб-екземпляр (наприклад, web.1 на власному порту) або залиште поле порожнім — тоді Aura відкриє власний порт.',
        chosen: (web, other) =>
            `${web} уже використовує ${other}: цей екземпляр там буде недоступний. Виберіть інший веб-екземпляр.`,
    },
    'zh-cn': {
        taken: (list) => `此处不可选择：${list}。`,
        why: '一个 Web 实例只在 /aura/ 下提供一个 Aura 实例。请为此实例添加另一个 Web 实例（例如在独立端口上的 web.1），或将此字段留空——此时 Aura 会打开自己的端口。',
        chosen: (web, other) => `${web} 已被 ${other} 使用：此实例在那里将无法访问。请选择其他 Web 实例。`,
    },
};
const BY = {
    en: (web, other) => `${web} (used by ${other})`,
    de: (web, other) => `${web} (nutzt ${other})`,
    ru: (web, other) => `${web} (использует ${other})`,
    pt: (web, other) => `${web} (usada por ${other})`,
    nl: (web, other) => `${web} (gebruikt door ${other})`,
    fr: (web, other) => `${web} (utilisée par ${other})`,
    it: (web, other) => `${web} (usata da ${other})`,
    es: (web, other) => `${web} (usada por ${other})`,
    pl: (web, other) => `${web} (używa ${other})`,
    uk: (web, other) => `${web} (використовує ${other})`,
    'zh-cn': (web, other) => `${web}（${other} 使用中）`,
};

const BOX = { padding: '8px 12px', borderRadius: 4, lineHeight: 1.5, marginTop: 4 };
const WARNING = { ...BOX, background: 'rgba(237, 108, 2, 0.12)', borderLeft: '4px solid #ed6c02' };
const ERROR = { ...BOX, background: 'rgba(211, 47, 47, 0.12)', borderLeft: '4px solid #d32f2f' };
const HIDDEN = { display: 'none' };

/**
 * @param {object} p parameters
 * @param {Map<string, string>} p.taken web instance → the Aura instance that uses it
 * @param {string} [p.chosen] the web instance currently chosen in the form
 * @param {string} [p.lang] system language
 * @returns {{ text: string, style: Record<string, string|number>, icon?: string }} the admin's textSendTo answer
 */
function webInstanceNote({ taken, chosen, lang }) {
    const t = TEXTS[lang || 'en'] || TEXTS.en;
    const by = BY[lang || 'en'] || BY.en;
    if (!taken || !taken.size) {
        return { text: '', style: HIDDEN };
    }
    if (chosen && taken.has(chosen)) {
        return { text: `⛔ ${t.chosen(chosen, taken.get(chosen))} ${t.why}`, style: ERROR };
    }
    const list = [...taken.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([web, other]) => by(web, other))
        .join(', ');
    return { text: `⚠ ${t.taken(list)} ${t.why}`, style: WARNING };
}

module.exports = { webInstanceNote };
