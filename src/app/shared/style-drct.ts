import { Directive, ElementRef, Renderer2, input, OnChanges, SimpleChanges, effect } from '@angular/core';

@Directive({
  selector: '[styleDrct]',
  standalone: true
})
export class StyleDrct {

  styleDrct = input<Record<string, string>>({}); // !!! naming must match selector
  // styleDrct = input<string>('styleDrct'); // !!! naming must match selector


  constructor(private el: ElementRef, private renderer: Renderer2) {
    effect(() => {
      const styles = this.styleDrct();
      for (const [prop, value] of Object.entries(styles)) {
        console.log('>===>> Directive - Styles passed in: ', prop,  ' - ', value);
        this.renderer.setStyle(this.el.nativeElement, prop, value);

      }
      // const color = this.styleDrct();
      // this.renderer.setStyle(this.el.nativeElement, 'color', color);
    });
  }
}


// Example usage:
// In component template:
//   <div [styleDrct]="{ color: 'blue', backgroundColor: 'lightgray' }">
//     Styled div
//   </div>

// or 

// In component class:
  // highlightStyles = {
  //   color: 'white',
  //   backgroundColor: 'teal',
  //   fontSize: '20px',
  //   padding: '10px'
  // };
// In component template:
// <h1 [styleDrct]="highlightStyles">
//   This header has dynamic styles
// </h1>
// or together with other classes
// <p [styleDrct]="otherStyles" class="custom-style">
//   This paragraph uses another style set
// </p>
// or conditionally
// <p [styleDrct]="condition ? highlightStyles : {}" class="custom-style">
//   Conditionally styled paragraph
// </p>
