pub const GraphemeBreakPedanticEmoji = enum(u5) {
    other,
    control,
    prepend,
    cr,
    lf,
    regional_indicator,
    spacing_mark,
    l,
    v,
    t,
    lv,
    lvt,
    zwj,
    zwnj,
    extended_pictographic,
    // extend, ==
    //   zwnj +
    //   indic_conjunct_break_extend +
    //   indic_conjunct_break_linker
    indic_conjunct_break_extend,
    indic_conjunct_break_linker,
    indic_conjunct_break_consonant,

    // Additional fields:
    emoji_modifier,
    emoji_modifier_base,
};
