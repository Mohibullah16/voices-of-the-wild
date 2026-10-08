// UI icons: Phosphor (MIT), regular weight, inlined at build time.
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import camera from "@phosphor-icons/core/regular/camera.svg?raw";
import images from "@phosphor-icons/core/regular/images.svg?raw";
import aperture from "@phosphor-icons/core/regular/aperture.svg?raw";
import play from "@phosphor-icons/core/fill/play-fill.svg?raw";
import pause from "@phosphor-icons/core/fill/pause-fill.svg?raw";
import replay from "@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw";
import book from "@phosphor-icons/core/regular/book-open-text.svg?raw";
import info from "@phosphor-icons/core/regular/info.svg?raw";
import ear from "@phosphor-icons/core/regular/ear.svg?raw";
import warning from "@phosphor-icons/core/regular/warning.svg?raw";
import download from "@phosphor-icons/core/regular/download-simple.svg?raw";
import upload from "@phosphor-icons/core/regular/upload-simple.svg?raw";
import wifiSlash from "@phosphor-icons/core/regular/wifi-slash.svg?raw";
import check from "@phosphor-icons/core/bold/check-bold.svg?raw";
import x from "@phosphor-icons/core/regular/x.svg?raw";
import arrowLeft from "@phosphor-icons/core/regular/arrow-left.svg?raw";
import footprints from "@phosphor-icons/core/regular/footprints.svg?raw";
import shield from "@phosphor-icons/core/regular/shield-check.svg?raw";
import binoculars from "@phosphor-icons/core/regular/binoculars.svg?raw";
import retry from "@phosphor-icons/core/regular/arrow-clockwise.svg?raw";
import trash from "@phosphor-icons/core/regular/trash.svg?raw";
import cpu from "@phosphor-icons/core/regular/cpu.svg?raw";
import sealCheck from "@phosphor-icons/core/regular/seal-check.svg?raw";
import flame from "@phosphor-icons/core/fill/flame-fill.svg?raw";
import medal from "@phosphor-icons/core/regular/medal.svg?raw";
import share from "@phosphor-icons/core/regular/share-network.svg?raw";
import sparkle from "@phosphor-icons/core/regular/sparkle.svg?raw";
import compass from "@phosphor-icons/core/regular/compass.svg?raw";
import roadHorizon from "@phosphor-icons/core/regular/road-horizon.svg?raw";
import tree from "@phosphor-icons/core/regular/tree.svg?raw";
import drop from "@phosphor-icons/core/regular/drop.svg?raw";
import cloud from "@phosphor-icons/core/regular/cloud.svg?raw";
import waves from "@phosphor-icons/core/regular/waves.svg?raw";
import storefront from "@phosphor-icons/core/regular/storefront.svg?raw";
import mountains from "@phosphor-icons/core/regular/mountains.svg?raw";
import barn from "@phosphor-icons/core/regular/barn.svg?raw";
import buildings from "@phosphor-icons/core/regular/buildings.svg?raw";
import leaf from "@phosphor-icons/core/regular/leaf.svg?raw";
import sunHorizon from "@phosphor-icons/core/regular/sun-horizon.svg?raw";
import moon from "@phosphor-icons/core/regular/moon.svg?raw";
import crown from "@phosphor-icons/core/regular/crown.svg?raw";
import mapPin from "@phosphor-icons/core/regular/map-pin.svg?raw";
import walk from "@phosphor-icons/core/regular/person-simple-walk.svg?raw";
import star from "@phosphor-icons/core/regular/star.svg?raw";
import lock from "@phosphor-icons/core/regular/lock-simple.svg?raw";
import arrowRight from "@phosphor-icons/core/regular/arrow-right.svg?raw";
import checkCircle from "@phosphor-icons/core/fill/check-circle-fill.svg?raw";
import circle from "@phosphor-icons/core/regular/circle.svg?raw";
import path from "@phosphor-icons/core/regular/path.svg?raw";
import trophy from "@phosphor-icons/core/regular/trophy.svg?raw";

const raw = {
  camera, images, aperture, play, pause, replay, book, info, ear, warning, download, upload, wifiSlash, check, x, arrowLeft, footprints, shield,
  binoculars, retry, trash, cpu, sealCheck, flame, medal, share, sparkle, compass, roadHorizon, tree, drop, cloud, waves, storefront, mountains,
  barn, buildings, leaf, sunHorizon, moon, crown, mapPin, walk, star, lock, arrowRight, checkCircle, circle, path, trophy,
};
export type IconName = keyof typeof raw;

const prepared = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k, v.replace("<svg ", '<svg aria-hidden="true" focusable="false" ')]),
) as Record<IconName, string>;

export const icon = (name: IconName) => unsafeSVG(prepared[name]);
export const iconString = (name: IconName) => prepared[name];
