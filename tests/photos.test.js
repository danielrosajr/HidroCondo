import test from 'node:test';
import assert from 'node:assert/strict';
import {scaledDimensions,PHOTO_STEPS,MAX_UPLOAD_BYTES,TARGET_UPLOAD_BYTES,formatPhotoBytes} from '../photos.js';

test('a foto em retrato preserva proporção e não ultrapassa dimensão máxima',()=>{
  assert.deepEqual(scaledDimensions(3024,4032,2048),{width:1536,height:2048});
});
test('a foto em paisagem preserva proporção',()=>{
  assert.deepEqual(scaledDimensions(4000,3000,1600),{width:1600,height:1200});
});
test('a imagem pequena nunca é ampliada',()=>{
  assert.deepEqual(scaledDimensions(640,480,2048),{width:640,height:480});
});
test('dimensões inválidas são rejeitadas',()=>{
  assert.throws(()=>scaledDimensions(0,2000,2048));
  assert.throws(()=>scaledDimensions(1920,NaN,1600));
});
test('o compressor mantém uma tentativa inicial de alta qualidade e limite compatível com o bucket',()=>{
  assert.ok(PHOTO_STEPS[0].maxEdge>=1920);
  assert.ok(PHOTO_STEPS[0].quality>=.85);
  assert.ok(TARGET_UPLOAD_BYTES<MAX_UPLOAD_BYTES);
});
test('tamanho de fotografia é apresentado em KB',()=>{
  assert.match(formatPhotoBytes(1024),/1\s?KB/);
});
