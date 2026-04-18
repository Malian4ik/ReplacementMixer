const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType
} = require('C:/Users/gadzh/AppData/Roaming/npm/node_modules/docx');
const fs = require('fs');

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  });
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  });
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
  });
}

function p(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22 })],
    spacing: { before: 80, after: 80 },
  });
}

function kv(key, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: key + ': ', bold: true, size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ],
    spacing: { before: 60, after: 60 },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level: 0 },
    spacing: { before: 40, after: 40 },
  });
}

function sep() {
  return new Paragraph({ text: '', spacing: { before: 100, after: 100 } });
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        shading: { type: ShadingType.SOLID, color: '1a2a3a' },
        width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
      })
    ),
    tableHeader: true,
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), size: 20 })] })],
          shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? 'f9f9f9' : 'ffffff' },
          width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
        })
      ),
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
}

const doc = new Document({
  styles: {
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        run: { size: 32, bold: true, color: '00d4e8' },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        run: { size: 26, bold: true, color: '00bcd4' },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        run: { size: 22, bold: true, color: '555555' },
      },
    ],
  },
  sections: [
    {
      children: [
        // ── ТИТУЛ ──────────────────────────────────────
        new Paragraph({
          children: [new TextRun({ text: 'MixerCup', bold: true, size: 56, color: '00d4e8' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Документация платформы', size: 30, color: '888888' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'https://replacement-mixer.vercel.app', size: 22, color: '00d4e8' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Дата: ' + new Date().toLocaleDateString('ru-RU'), size: 20, color: '888888' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 400 },
        }),

        // ── СТАТИСТИКА ──────────────────────────────────────
        h1('Статистика платформы'),
        makeTable(
          ['Показатель', 'Значение'],
          [
            ['Команд', '24'],
            ['Активных игроков', '254'],
            ['Игроков в пуле замен', '110'],
            ['Замен совершено', '37'],
          ]
        ),
        sep(),

        // ── РОЛИ ──────────────────────────────────────
        h1('Роли пользователей'),
        p('Система имеет 5 уровней доступа:'),
        makeTable(
          ['Роль', 'Описание'],
          [
            ['OWNER', 'Полный доступ ко всем разделам. Управляет пользователями: одобряет регистрации, меняет роли, удаляет аккаунты. Один на всю платформу.'],
            ['JUDGE', 'Судья: делает замены, добавляет игроков в пул, назначает капитанов, проставляет ночные матчи, видит FAQ.'],
            ['MARKETING', 'Только просмотр разделов «Команды» и «Журнал». Без права изменений.'],
            ['VIEWER', 'Только просмотр: Игроки, Команды, Пул, Очередь, Расписание.'],
            ['PENDING', 'Ожидает одобрения OWNER. Доступа к системе нет.'],
          ]
        ),
        sep(),

        // ── РАЗДЕЛЫ ──────────────────────────────────────
        h1('Разделы сайта'),
        makeTable(
          ['Раздел', 'URL', 'Доступ', 'Что можно делать'],
          [
            ['Игроки', '/players', 'OWNER, JUDGE, VIEWER', 'Поиск по нику и кошельку. Просмотр MMR, ставки, ролей, статуса. OWNER/JUDGE: добавить в пул замен, деактивировать. Плашки «В команде» / «Капитан».'],
            ['Команды', '/teams', 'Все кроме PENDING', 'Просмотр состава команд. OWNER/JUDGE: создать команду, добавить/убрать игроков, назначить капитана. Переход на страницу команды.'],
            ['Страница команды', '/teams/[id]', 'Все кроме PENDING', 'Таблица игроков: MMR, роли, ставка, кошелёк, Telegram, ночные матчи, статус. OWNER/JUDGE: менять роли, проставлять ночные матчи, назначать капитана.'],
            ['Пул замен', '/pool', 'Все кроме PENDING', 'Позиция в очереди, MMR, ставка, роль, кошелёк. Игроки в команде не отображаются. 10 игроков на страницу.'],
            ['Очередь', '/queue', 'Все кроме PENDING', 'Список ожидающих замены с SubScore и позицией.'],
            ['Панель судьи', '/judge', 'OWNER, JUDGE', '3-колонная панель для назначения замен. Подробнее в разделе «Панель судьи».'],
            ['Журнал', '/logs', 'OWNER, JUDGE, MARKETING', 'История замен, счётчик по командам. OWNER: отправить в Telegram, очистить журнал.'],
            ['Расписание', '/schedule', 'Все кроме PENDING', 'Матчи по раундам. OWNER/JUDGE: перенести матч, засчитать тех. поражение.'],
            ['FAQ (Инструкция)', '/guide', 'OWNER, JUDGE', 'Инструкция для судей: процесс замен, правила пула, формула SubScore.'],
            ['Управление пользователями', '/admin/users', 'OWNER', 'Одобрить регистрацию, изменить роль, удалить пользователя.'],
          ]
        ),
        sep(),

        // ── ПАНЕЛЬ СУДЬИ ──────────────────────────────────────
        h1('Панель судьи (/judge)'),
        p('Основной инструмент для назначения замен. Состоит из 3 колонок.'),
        sep(),
        h2('Пошаговая инструкция'),
        kv('Шаг 1', 'Match ID (опционально) — введи ID матча из Dota 2'),
        kv('Шаг 2', 'Выбери команду из выпадающего списка (название + средний MMR)'),
        kv('Шаг 3', 'Нажми на игрока которого заменяем (красная подсветка). Или «пустое место» для добавления на свободный слот.'),
        kv('Шаг 4', 'Введи своё имя в поле «Судья» (обязательно)'),
        kv('Шаг 5', 'В центральной колонке появятся кандидаты по SubScore. Зелёный = лучший. Если больше 10 — используй пагинацию.'),
        kv('Шаг 6', 'Нажми на кандидата (синяя рамка) → «Назначить замену»'),
        sep(),
        h2('Показатели кандидатов'),
        makeTable(
          ['Показатель', 'Описание'],
          [
            ['Target MMR', 'Среднее MMR турнира. Показывается в шапке панели.'],
            ['Max Deviation', '±1000 MMR — максимальное отклонение среднего MMR команды после замены'],
            ['SubScore', 'Итоговый балл кандидата: 0.6 * Stake_norm + 0.3 * MMR_norm + 0.1 * RoleFit'],
            ['RoleFit', '1.0 = основная роль | 0.8 = флекс роль | 0.0 = роль не подходит'],
            ['BF (Balance Factor)', 'Насколько хорошо замена балансирует MMR команды. Чем ближе к 1 — тем лучше.'],
            ['→ MMR', 'Прогноз среднего MMR команды после этой замены'],
          ]
        ),
        sep(),
        h2('Цвета строк кандидатов'),
        makeTable(
          ['Цвет', 'Значение'],
          [
            ['Зелёный', 'Топ кандидаты (первые ~40% списка)'],
            ['Жёлтый', 'Средние кандидаты (40–70%)'],
            ['Красный', 'Худшие кандидаты (нижние 30%)'],
          ]
        ),
        sep(),

        // ── ПУЛ ЗАМЕН ──────────────────────────────────────
        h1('Пул замен'),
        h2('Как игрок попадает в пул'),
        bullet('Способ 1: Вручную через вкладку «Игроки» — кнопка «В пул замен» (доступна OWNER и JUDGE)'),
        bullet('Способ 2: Автоматически когда игрок заменяется из команды — попадает в конец очереди (joinTime = текущий максимум + 1 секунда)'),
        sep(),
        h2('Порядок очереди'),
        p('Игроки сортируются по joinTime (дата добавления). Чем меньше — тем выше в очереди. Новые игроки всегда встают в конец.'),
        p('Закреплённые игроки: часть игроков закреплена в самом конце очереди (joinTime = 2099 год). Новые игроки встают перед ними.'),
        sep(),
        h2('Статусы записи в пуле'),
        makeTable(
          ['Статус', 'Значение'],
          [
            ['Active', 'Игрок ожидает замены'],
            ['Picked', 'Был выбран на замену (ушёл в команду)'],
          ]
        ),
        sep(),
        h2('Ночные матчи'),
        p('Счётчик ночных матчей обнуляется ТОЛЬКО при замене с 00:00 до 06:30 МСК (ночное время).'),
        p('Если замена произошла с 06:30 до 23:59 МСК — счётчик НЕ обнуляется, стрик сохраняется.'),
        sep(),

        // ── КАПИТАНЫ ──────────────────────────────────────
        h1('Система капитанов'),
        makeTable(
          ['Параметр', 'Описание'],
          [
            ['Что такое капитан', 'Особый статус игрока в команде. Название команды не меняется.'],
            ['Кто назначает', 'OWNER и JUDGE на странице команды (/teams/[id])'],
            ['Как назначить', 'Страница команды → кнопка «Капитан» рядом с игроком. Старый капитан снимается автоматически.'],
            ['Плашка', 'На странице «Игроки»: «В команде · Капитан»'],
            ['Один капитан', 'В каждой команде только один капитан одновременно'],
            ['Если капитан уходит на замену', 'Плашка автоматически переходит к игроку с наибольшей ставкой в команде. Название не меняется.'],
          ]
        ),
        sep(),

        // ── TELEGRAM ──────────────────────────────────────
        h1('Telegram бот'),
        p('Бот отправляет отчёты в Telegram группу с информацией о командах и счётчиком замен.'),
        sep(),
        h2('Содержание отчёта'),
        bullet('Составы команд: каждый игрок с MMR, ролью, ставкой, ночными матчами, кошельком, Telegram'),
        bullet('Счётчик замен: сколько замен сделано для каждой команды'),
        sep(),
        h2('Управление'),
        kv('Отправить вручную', 'Журнал (/logs) → «Отправить в Telegram» (только OWNER)'),
        kv('Автоотправка', 'Каждый день в 12:00 UTC через cron-задачу'),
        kv('Настройка', 'Журнал → «Настроить Telegram» → нажать Start у бота → система получит chat_id автоматически'),
        sep(),

        // ── УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ──────────────────────────────────────
        h1('Управление пользователями (/admin/users)'),
        p('Доступно только OWNER.'),
        sep(),
        h2('Процесс'),
        kv('Регистрация', 'Новый пользователь регистрируется на /register. Роль PENDING — доступа нет.'),
        kv('Одобрение', '/admin/users → «Одобрить» → роль становится VIEWER, доступ открывается'),
        kv('Смена роли', 'Выпадающий список в строке пользователя → сохранить'),
        kv('Удаление', 'Кнопка «Удалить» в таблице пользователей'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const path = 'C:/Users/gadzh/OneDrive/Desktop/mixercup_docs.docx';
  fs.writeFileSync(path, buffer);
  console.log('Saved:', path);
});
