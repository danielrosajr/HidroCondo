// HidroCondo photo utilities. All processing happens locally before upload.
// Never compress by upscaling: water-meter digits must remain readable.
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const TARGET_UPLOAD_BYTES = 1300 * 1024;
export const PHOTO_STEPS = Object.freeze([
  {maxEdge: 2048, quality: 0.88},
  {maxEdge: 1920, quality: 0.84},
  {maxEdge: 1600, quality: 0.80},
  {maxEdge: 1600, quality: 0.73},
  {maxEdge: 1280, quality: 0.73}
]);

export function scaledDimensions(width, height, maxEdge) {
  if (![width, height, maxEdge].every(v => Number.isFinite(v) && v > 0)) {
    throw Error('Dimensões inválidas na fotografia.');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}
export const formatPhotoBytes = bytes => `${(bytes / 1024).toLocaleString('pt-BR',{maximumFractionDigits:0})} KB`;

function decodePhoto(file) {
  return new Promise((resolve,reject) => {
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Não foi possível abrir a foto. Use JPG, PNG ou WebP (alguns formatos HEIC não são suportados pelo navegador).'));};
    img.src=url;
  });
}
function encodeWebp(canvas, quality) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => {
    if(!blob || blob.type !== 'image/webp')return reject(Error('Este navegador não conseguiu gerar WebP. Atualize o navegador para enviar fotos.'));
    resolve(blob);
  }, 'image/webp', quality));
}
export async function compressPhoto(file) {
  if(!file || !file.type.startsWith('image/'))throw Error('Selecione uma fotografia válida.');
  if(file.size>MAX_SOURCE_BYTES)throw Error('A foto excede 30 MB. Escolha uma imagem menor.');
  const image=await decodePhoto(file);
  let best=null;
  for(const {maxEdge,quality} of PHOTO_STEPS){
    const {width,height}=scaledDimensions(image.naturalWidth,image.naturalHeight,maxEdge);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');
    if(!context)throw Error('Não foi possível processar a imagem.');
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality='high';
    context.drawImage(image,0,0,width,height);
    const blob=await encodeWebp(canvas,quality);
    if(!best || blob.size < best.size)best=blob;
    if(blob.size <= TARGET_UPLOAD_BYTES)break;
  }
  if(!best || best.size>MAX_UPLOAD_BYTES)throw Error('Não foi possível reduzir esta foto abaixo de 5 MB. Tente outra imagem.');
  return best;
}
