package androidx.compose.ui.unit
@JvmInline value class Dp(val value: Float) { operator fun times(other: Float) = Dp(value * other) }
@JvmInline value class TextUnit(val value: Float)
val Int.sp: TextUnit get() = TextUnit(toFloat())
val Int.dp: Dp get() = Dp(toFloat())
