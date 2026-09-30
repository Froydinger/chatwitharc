const fs=require('node:fs');const {execFileSync}=require('node:child_process');const assert=require('node:assert/strict');
const path='src/components/music/BenchoNowPlaying.tsx';
const previous=execFileSync('git',['show',`0e96e094:${path}`],{encoding:'utf8'})
 .replace('import { useReducedMotion } from "framer-motion";','import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";')
 .replace('const still = !!useReducedMotion();','const still = useReducedMotionPreference();');
assert.equal(fs.readFileSync(path,'utf8'),previous);
console.log('Music source matches 0e96e094 except the reduced-motion import and hook call; geometry, tween and controls are unchanged.');
