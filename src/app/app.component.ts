import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'gomipoy';
  isHelpOpen: boolean = false;
  onClickBtnSm(): void {
    this.isHelpOpen = !this.isHelpOpen;
  }
}
