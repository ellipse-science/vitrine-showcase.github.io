// ffmpeg-static ne publie pas ses types : il exporte le chemin du binaire,
// ou null quand la plateforme n'est pas prise en charge.
declare module "ffmpeg-static" {
  const ffmpegPath: string | null;
  export default ffmpegPath;
}
