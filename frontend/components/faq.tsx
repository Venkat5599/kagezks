"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

const faqs = [
  {
    question: "Why not just encrypt the payments?",
    answer:
      "Encryption hides data but trusts whoever holds the key — a server, a custodian, you. Veil makes the agent→payee link unprovable to anyone, enforced by the zk-SNARK and the chain itself. No party holds a secret that could reconstruct who paid whom.",
  },
  {
    question: "What exactly does the chain see?",
    answer:
      "Only Poseidon commitments, random ephemeral keys, a Merkle root, and nullifier hashes. Never a payee's identity, never an amount tied to a party, and never a link from the agent's deposit to a payee's withdrawal.",
  },
  {
    question: "Why is ZK load-bearing — couldn't you drop it?",
    answer:
      "No. Remove the pool proof and every withdrawal must name the agent's deposit, so the whole agent spend graph goes public. Remove the nullifier and a payment note can be claimed twice, draining the pool. Remove the recipient binding and a relayer can redirect a payee's funds. The privacy is the proof.",
  },
  {
    question: "Is this real, or a mockup?",
    answer:
      "Real. The withdraw circuit (3005 constraints) and insert circuit (4910) both prove and verify with snarkjs Groth16. The Soroban pool ran a full deposit → withdraw → rejected double-spend on Stellar testnet, with the BN254 pairing check passing on-chain.",
  },
  {
    question: "What's honestly still a demo limitation?",
    answer:
      "Testnet only, no real funds. v1 stealth uses a single-derived key (no view/spend separation — a documented stretch). Demo tree depth is 10 (1024 notes); the same circuit scales to depth 20. Fixed-denomination notes keep the anonymity set clean. The ZK and every transaction are real; only the parties are ours.",
  },
];

const ease = [0.23, 1, 0.32, 1] as const;

function FAQItem({
  faq,
  index,
  isOpen,
  onToggle,
}: {
  faq: (typeof faqs)[0];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease, delay: index * 0.05 }}
      onClick={onToggle}
      className="cursor-pointer rounded-2xl bg-frame p-5 shadow-sm sm:p-6"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isOpen}
    >
      <div className="flex w-full items-center justify-between gap-4 text-left">
        <span className="text-base font-medium text-foreground sm:text-lg">
          {faq.question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease }}
          className="shrink-0"
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ(): ReactNode {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="w-full px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mb-12 text-center sm:mb-16"
        >
          <span className="text-sm font-medium text-muted-foreground">
            The honest version
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            What judges usually ask
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Scope, trust assumptions, and why the ZK is the whole point.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <motion.a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              View on GitHub
            </motion.a>
            <motion.a
              href="https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl border border-border bg-frame px-6 py-2.5 text-sm font-semibold text-foreground transition-colors"
            >
              View the contract
            </motion.a>
          </div>
        </motion.div>

        <div className="flex flex-col gap-3" role="list">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              faq={faq}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
