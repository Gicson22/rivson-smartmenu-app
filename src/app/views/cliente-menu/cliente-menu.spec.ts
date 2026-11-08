import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClienteMenu } from './cliente-menu';

describe('ClienteMenu', () => {
  let component: ClienteMenu;
  let fixture: ComponentFixture<ClienteMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClienteMenu],
    }).compileComponents();

    fixture = TestBed.createComponent(ClienteMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
