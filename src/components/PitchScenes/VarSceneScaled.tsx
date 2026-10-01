import ScaledScene from './ScaledScene';
import VarScene from './VarScene';

/** 03 · VAR sahnesi, kutu genişliğine ölçekli — next/dynamic ile yüklenen kullanımlar için tek giriş. */
export default function VarSceneScaled() {
  return (
    <ScaledScene>
      <VarScene />
    </ScaledScene>
  );
}
