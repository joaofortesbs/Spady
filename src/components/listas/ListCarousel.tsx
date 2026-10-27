"use client";

import { ArrowRight } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import type { PersonalList } from "@/lib/listas/model";

export function ListCarousel({ lists, activeListId, onSelect }: { lists: PersonalList[]; activeListId: string; onSelect: (id: string) => void }) {
  return (
    <Carousel className="listas-carousel" opts={{ align: "start", containScroll: "trimSnaps" }}>
      <CarouselContent className="listas-carousel-track">
        {lists.map((list, index) => {
          const selected = list.id === activeListId;
          return (
            <CarouselItem className="listas-carousel-slide" key={list.id}>
              <button type="button" aria-pressed={selected} onClick={() => onSelect(list.id)} className={`listas-collection-card${selected ? " is-selected" : ""}`}>
                <span className="listas-collection-top">
                  <span className="listas-collection-number">COLEÇÃO / {String(index + 1).padStart(2, "0")}</span>
                  {selected && <span className="listas-selected-label">SELECIONADA</span>}
                </span>
                <span className="listas-collection-bottom">
                  <span className="listas-collection-copy">
                    <strong>{list.name}</strong>
                    {list.description && <small>{list.description}</small>}
                  </span>
                  <span className="listas-collection-arrow"><ArrowRight size={13} /></span>
                </span>
              </button>
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {lists.length > 2 && <><CarouselPrevious aria-label="Lista anterior" /><CarouselNext aria-label="Próxima lista" /></>}
    </Carousel>
  );
}
