export interface DailyQuote {
  text: string;
  source: string;
  tradition: "儒" | "释" | "道" | "禅" | "圣经";
}

/**
 * A small, reviewed library is more dependable here than a remote quote API:
 * it is instant, works offline, and cannot introduce noisy or unsuitable copy.
 */
export const DAILY_QUOTES: readonly DailyQuote[] = [
  { text: "学而时习之，不亦说乎。", source: "《论语·学而》", tradition: "儒" },
  { text: "温故而知新，可以为师矣。", source: "《论语·为政》", tradition: "儒" },
  { text: "知之为知之，不知为不知，是知也。", source: "《论语·为政》", tradition: "儒" },
  { text: "三人行，必有我师焉。", source: "《论语·述而》", tradition: "儒" },
  { text: "见贤思齐焉，见不贤而内自省也。", source: "《论语·里仁》", tradition: "儒" },
  { text: "工欲善其事，必先利其器。", source: "《论语·卫灵公》", tradition: "儒" },
  { text: "岁寒，然后知松柏之后凋也。", source: "《论语·子罕》", tradition: "儒" },
  { text: "己所不欲，勿施于人。", source: "《论语·颜渊》", tradition: "儒" },
  { text: "知者不惑，仁者不忧，勇者不惧。", source: "《论语·子罕》", tradition: "儒" },
  { text: "博学而笃志，切问而近思，仁在其中矣。", source: "《论语·子张》", tradition: "儒" },

  { text: "上善若水，水善利万物而不争。", source: "《道德经》第八章", tradition: "道" },
  { text: "知人者智，自知者明。", source: "《道德经》第三十三章", tradition: "道" },
  { text: "知足者富，强行者有志。", source: "《道德经》第三十三章", tradition: "道" },
  { text: "合抱之木，生于毫末。", source: "《道德经》第六十四章", tradition: "道" },
  { text: "千里之行，始于足下。", source: "《道德经》第六十四章", tradition: "道" },
  { text: "慎终如始，则无败事。", source: "《道德经》第六十四章", tradition: "道" },
  { text: "致虚极，守静笃。", source: "《道德经》第十六章", tradition: "道" },
  { text: "重为轻根，静为躁君。", source: "《道德经》第二十六章", tradition: "道" },
  { text: "大成若缺，其用不弊。", source: "《道德经》第四十五章", tradition: "道" },
  { text: "人法地，地法天，天法道，道法自然。", source: "《道德经》第二十五章", tradition: "道" },

  { text: "诸行无常，是生灭法。", source: "《大般涅槃经》", tradition: "释" },
  { text: "应无所住，而生其心。", source: "《金刚经》", tradition: "释" },
  { text: "凡所有相，皆是虚妄。", source: "《金刚经》", tradition: "释" },
  { text: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。", source: "《金刚经》", tradition: "释" },
  { text: "过去心不可得，现在心不可得，未来心不可得。", source: "《金刚经》", tradition: "释" },
  { text: "不取于相，如如不动。", source: "《金刚经》", tradition: "释" },
  { text: "制心一处，无事不办。", source: "《佛遗教经》", tradition: "释" },
  { text: "照见五蕴皆空，度一切苦厄。", source: "《心经》", tradition: "释" },
  { text: "诸恶莫作，众善奉行，自净其意，是诸佛教。", source: "《法句经》", tradition: "释" },
  { text: "心如工画师，能画诸世间。", source: "《华严经》", tradition: "释" },

  { text: "平常心是道。", source: "《景德传灯录》", tradition: "禅" },
  { text: "日日是好日。", source: "云门文偃", tradition: "禅" },
  { text: "吃茶去。", source: "赵州从谂", tradition: "禅" },
  { text: "本来无一物，何处惹尘埃。", source: "《六祖坛经》", tradition: "禅" },
  { text: "行亦禅，坐亦禅，语默动静体安然。", source: "《永嘉证道歌》", tradition: "禅" },
  { text: "春有百花秋有月，夏有凉风冬有雪。", source: "无门慧开", tradition: "禅" },
  { text: "困来即眠，饥来即食。", source: "大珠慧海", tradition: "禅" },
  { text: "一日不作，一日不食。", source: "百丈怀海", tradition: "禅" },
  { text: "青山元不动，浮云任去来。", source: "禅门偈语", tradition: "禅" },
  { text: "不雨花犹落，无风絮自飞。", source: "禅门偈语", tradition: "禅" },

  { text: "凡事都有定期，天下万务都有定时。", source: "《传道书》3:1", tradition: "圣经" },
  { text: "爱是恒久忍耐，又有恩慈。", source: "《哥林多前书》13:4", tradition: "圣经" },
  { text: "喜乐的心乃是良药。", source: "《箴言》17:22", tradition: "圣经" },
  { text: "你要保守你心，胜过保守一切。", source: "《箴言》4:23", tradition: "圣经" },
  { text: "智慧为首，所以要得智慧。", source: "《箴言》4:7", tradition: "圣经" },
  { text: "殷勤不可懒惰，要心里火热。", source: "《罗马书》12:11", tradition: "圣经" },
  { text: "不要为明日自夸，因为一日要生何事，你尚且不能知道。", source: "《箴言》27:1", tradition: "圣经" },
  { text: "铁磨铁，磨出刃来；朋友相感，也是如此。", source: "《箴言》27:17", tradition: "圣经" },
  { text: "寻找，就寻见。", source: "《马太福音》7:7", tradition: "圣经" },
  { text: "我们行善，不可丧志。", source: "《加拉太书》6:9", tradition: "圣经" },
] as const;

const COPRIME_STEPS = [3, 7, 9, 11, 13, 17, 19, 21, 23, 27, 29, 31, 33, 37, 39, 41, 43, 47, 49] as const;

function chinaDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) / 86_400_000);
}

function mix(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/** Stable for a whole China day, with every quote used once per 50-day cycle. */
export function quoteForDate(date = new Date()): DailyQuote {
  const day = chinaDayNumber(date);
  const cycle = Math.floor(day / DAILY_QUOTES.length);
  const position = ((day % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length;
  const step = COPRIME_STEPS[mix(cycle) % COPRIME_STEPS.length];
  const offset = mix(cycle + 0x9e3779b9) % DAILY_QUOTES.length;
  return DAILY_QUOTES[(offset + position * step) % DAILY_QUOTES.length];
}
