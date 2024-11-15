function probSampleToOpenai(probSample, temp, topP = 1, hiddenVocabNum = null) {
    /*
    from: https://github.com/vllm-project/vllm/issues/9453#issuecomment-2451815729
    */
  probSample = probSample.map(p => p * topP);
  const topLogprobs = probSample.length;

  if (hiddenVocabNum === null) {
    hiddenVocabNum = (1 - probSample.reduce((a, b) => a + b, 0) > 0.001) ? 1 : 0;
  }

  if (hiddenVocabNum > 0) {
    const hiddenProbValue = Math.max(1 - probSample.reduce((a, b) => a + b, 0), 0) / hiddenVocabNum;
    const hiddenProbs = Array(hiddenVocabNum).fill(hiddenProbValue);
    probSample = probSample.concat(hiddenProbs);
  }

  const probRecoverUnnorm = probSample.map(p => Math.pow(p, temp));
  const probRecoverSum = probRecoverUnnorm.reduce((a, b) => a + b, 0);
  const probRecover = probRecoverUnnorm.map(p => p / probRecoverSum);

  return probRecover.slice(0, topLogprobs);
}
if(typeof module !== 'undefined') {
    // Test case

    // Sampling parameters
    const temp = 0.5;
    const topP = 0.9;
    const topLogprobs = 3;

    // Original logits
    const logits = [1, 0, -1, -2];

    // Compute prob_sample using softmax with temperature temp
    const logitsTemp = logits.map(logit => logit / temp);
    const expLogitsTemp = logitsTemp.map(logit => Math.exp(logit));
    const expLogitsTempSum = expLogitsTemp.reduce((a, b) => a + b, 0);
    let probSample = expLogitsTemp.map(logit => logit / expLogitsTempSum);

    probSample = probSample.map(p => p / topP);
    probSample = probSample.slice(0, topLogprobs);

    const probRecover = probSampleToOpenai(probSample, temp, topP);

    console.log(" prob_sample:", probSample);
    console.log("prob_recover:", probRecover);

    // Ground truth probabilities
    const expLogits = logits.map(logit => Math.exp(logit));
    const expLogitsSum = expLogits.reduce((a, b) => a + b, 0);
    const probGt = expLogits.map(logit => logit / expLogitsSum);
    console.log("     prob_gt:", probGt);
    }